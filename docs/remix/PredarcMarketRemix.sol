// SPDX-License-Identifier: MIT
//
// PredarcMarket — single-file build for Remix (OpenZeppelin 5.1.0 inlined, no imports).
// Same logic as contracts/PredarcMarket.sol in the repo. Use it to deploy YOUR OWN copy on
// Arc Testnet so that your admin wallet is the contract owner (createMarket / resolve /
// cancel / fees are onlyOwner: only the deploying wallet can call them).
//
// ── Remix settings ───────────────────────────────────────────────────────────
//  1. Solidity compiler:  0.8.28
//  2. EVM version:        paris
//  3. Optimization:       ON, runs = 200
//  4. viaIR:              ON   (REQUIRED — createMarket has 10 parameters and fails with
//                              "Stack too deep" without it). In Remix: tick
//                              "Use configuration file" and add a compiler_config.json:
//        {
//          "language": "Solidity",
//          "settings": {
//            "viaIR": true,
//            "optimizer": { "enabled": true, "runs": 200 },
//            "evmVersion": "paris"
//          }
//        }
//
// ── Deploy (Deploy & Run → Injected Provider → wallet on Arc Testnet, chain 5042002) ─
//  Contract: PredarcMarket
//  Constructor arguments:
//    _usdc        0x3600000000000000000000000000000000000000   (USDC on Arc)
//    feeRecipient_ your fee wallet address
//    feeBps_      200                                          (2%; max 500)
//
// ── After deploy ─────────────────────────────────────────────────────────────
//  • Optional, for testnet only: call setMinLiquidity(1000000) to allow 1 USDC markets
//    (default minimum is 10 USDC = 10000000).
//  • Copy the deployed address into Admin → Config → Testnet settings, then press
//    "Check testnet contract" to confirm you are the owner.
//
pragma solidity ^0.8.20;

// ───── @openzeppelin/contracts/utils/Context.sol ─────
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// ───── @openzeppelin/contracts/access/Ownable.sol ─────
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// ───── @openzeppelin/contracts/utils/ReentrancyGuard.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// ───── @openzeppelin/contracts/token/ERC20/IERC20.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// ───── @openzeppelin/contracts/interfaces/IERC20.sol ─────
// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC20.sol)

// ───── @openzeppelin/contracts/utils/introspection/IERC165.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// ───── @openzeppelin/contracts/interfaces/IERC165.sol ─────
// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC165.sol)

// ───── @openzeppelin/contracts/interfaces/IERC1363.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// ───── @openzeppelin/contracts/utils/Errors.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Errors.sol)

/**
 * @dev Collection of common custom errors used in multiple contracts
 *
 * IMPORTANT: Backwards compatibility is not guaranteed in future versions of the library.
 * It is recommended to avoid relying on the error API for critical functionality.
 *
 * _Available since v5.1._
 */
library Errors {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error InsufficientBalance(uint256 balance, uint256 needed);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedCall();

    /**
     * @dev The deployment failed.
     */
    error FailedDeployment();

    /**
     * @dev A necessary precompile is missing.
     */
    error MissingPrecompile(address);
}

// ───── @openzeppelin/contracts/utils/Address.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Address.sol)

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev There's no code at `target` (it is not a contract).
     */
    error AddressEmptyCode(address target);

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.20/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        if (address(this).balance < amount) {
            revert Errors.InsufficientBalance(address(this).balance, amount);
        }

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert Errors.FailedCall();
        }
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason or custom error, it is bubbled
     * up by this function (like regular Solidity function calls). However, if
     * the call reverted with no returned reason, this function reverts with a
     * {Errors.FailedCall} error.
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) {
            revert Errors.InsufficientBalance(address(this).balance, value);
        }
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and reverts if the target
     * was not a contract or bubbling up the revert reason (falling back to {Errors.FailedCall}) in case
     * of an unsuccessful call.
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata
    ) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            // only check if target is a contract if the call was successful and the return data is empty
            // otherwise we already know that it was a contract
            if (returndata.length == 0 && target.code.length == 0) {
                revert AddressEmptyCode(target);
            }
            return returndata;
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and reverts if it wasn't, either by bubbling the
     * revert reason or with a default {Errors.FailedCall} error.
     */
    function verifyCallResult(bool success, bytes memory returndata) internal pure returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            return returndata;
        }
    }

    /**
     * @dev Reverts with returndata if present. Otherwise reverts with {Errors.FailedCall}.
     */
    function _revert(bytes memory returndata) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            assembly ("memory-safe") {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert Errors.FailedCall();
        }
    }
}

// ───── @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol ─────
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}

// ───── contracts/PredarcMarket.sol ─────
interface IChainlinkFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

contract PredarcMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MarketType {
        Binary,
        MultipleChoice,
        Scalar
    }

    enum MarketStatus {
        Open,
        Closed,
        Resolved,
        Cancelled
    }

    struct Market {
        uint256 id;
        MarketType marketType;
        MarketStatus status;
        string question;
        string[] outcomes;
        uint256 endTime;
        uint256 resolutionTime;
        uint256 resolvedOutcome;
        int256 resolvedScalarValue;
        int256 scalarLow;
        int256 scalarHigh;
        uint256 totalLiquidity;
        uint256[] outcomePools;
        uint256 feesCollected;
        address creator;
        string category;
        string imageUrl;
        bool featured;
    }

    event MarketCreated(uint256 indexed marketId, MarketType marketType, string question, uint256 endTime);
    event MarketResolved(uint256 indexed marketId, uint256 outcome, int256 scalarValue);
    event MarketCancelled(uint256 indexed marketId);
    event MarketClosed(uint256 indexed marketId);
    event SharesBought(uint256 indexed marketId, address indexed user, uint256 outcomeIndex, uint256 usdcIn, uint256 sharesOut);
    event SharesSold(uint256 indexed marketId, address indexed user, uint256 outcomeIndex, uint256 sharesIn, uint256 usdcOut);
    event WinningsRedeemed(uint256 indexed marketId, address indexed user, uint256 amount);
    event FeeSet(uint256 newFeeBps);
    event FeeRecipientSet(address newRecipient);
    event LiquidityAdded(uint256 indexed marketId, uint256 amount);
    event LiquidityRemoved(uint256 indexed marketId, uint256 amount);
    event MinLiquiditySet(uint256 amount);
    event PriceFeedSet(uint256 indexed marketId, address feed);

    error InvalidAddress();
    error InvalidFee();
    error InvalidMarket();
    error InvalidOutcome();
    error InvalidTimes();
    error InvalidLiquidity();
    error InvalidStatus();
    error TradingClosed();
    error SlippageExceeded();
    error InsufficientShares();
    error NotResolvable();
    error NotScalarMarket();
    error NotDiscreteMarket();
    error AlreadyRedeemed();
    error NothingToRedeem();

    IERC20 public immutable usdc;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant MAX_FEE_BPS = 500;
    uint256 private constant USDC_DECIMALS_MULTIPLIER = 1e12; // 1e18 shares / 1e6 USDC
    uint256 private constant MIN_MARKET_DURATION = 1 hours;
    uint256 private constant MIN_OUTCOMES = 2;
    uint256 private constant MAX_OUTCOMES = 10;
    uint256 private constant RESOLUTION_GRACE_PERIOD = 30 days;

    uint256 private _feeBps;
    address private _feeRecipient;
    uint256 private _accruedProtocolFees;
    uint256 private _marketCount;
    uint256 private _minLiquidity;

    mapping(uint256 => Market) private _markets;
    uint256[] private _marketIds;

    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) private _userShares;
    mapping(uint256 => mapping(address => uint256)) private _userNetCost;
    mapping(uint256 => mapping(uint256 => uint256)) private _totalOutstandingShares;
    mapping(uint256 => mapping(address => bool)) private _redeemed;

    mapping(address => uint256[]) private _userTouchedMarkets;
    mapping(address => mapping(uint256 => bool)) private _userTouchedMarketFlag;

    mapping(uint256 => address) private _marketPriceFeed;
    mapping(uint256 => uint256) private _marketFeedStaleness;

    constructor(address _usdc, address feeRecipient_, uint256 feeBps_) Ownable(msg.sender) {
        if (_usdc == address(0) || feeRecipient_ == address(0)) {
            revert InvalidAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) {
            revert InvalidFee();
        }

        usdc = IERC20(_usdc);
        _feeRecipient = feeRecipient_;
        _feeBps = feeBps_;
        _minLiquidity = 10 * 1e6;
    }

    function createMarket(
        MarketType marketType,
        string calldata question,
        string[] calldata outcomes,
        uint256 endTime,
        uint256 resolutionTime,
        int256 scalarLow,
        int256 scalarHigh,
        string calldata category,
        string calldata imageUrl,
        uint256 initialLiquidity
    ) external onlyOwner nonReentrant returns (uint256 marketId) {
        if (endTime <= block.timestamp + MIN_MARKET_DURATION || resolutionTime < endTime) {
            revert InvalidTimes();
        }
        if (initialLiquidity < _minLiquidity) {
            revert InvalidLiquidity();
        }

        uint256 outcomeCount = outcomes.length;
        if (marketType == MarketType.Binary) {
            if (outcomeCount != 2) revert InvalidOutcome();
        } else if (marketType == MarketType.MultipleChoice) {
            if (outcomeCount < MIN_OUTCOMES || outcomeCount > MAX_OUTCOMES) revert InvalidOutcome();
        } else {
            if (outcomeCount != 2 || scalarHigh <= scalarLow) revert InvalidOutcome();
        }

        usdc.safeTransferFrom(msg.sender, address(this), initialLiquidity);

        marketId = ++_marketCount;
        _marketIds.push(marketId);

        Market storage m = _markets[marketId];
        m.id = marketId;
        m.marketType = marketType;
        m.status = MarketStatus.Open;
        m.question = question;
        m.endTime = endTime;
        m.resolutionTime = resolutionTime;
        m.scalarLow = scalarLow;
        m.scalarHigh = scalarHigh;
        m.totalLiquidity = initialLiquidity;
        m.creator = msg.sender;
        m.category = category;
        m.imageUrl = imageUrl;

        uint256 basePool = initialLiquidity / outcomeCount;
        uint256 remainder = initialLiquidity - (basePool * outcomeCount);

        for (uint256 i = 0; i < outcomeCount; i++) {
            m.outcomes.push(outcomes[i]);
            uint256 poolAmount = basePool;
            if (remainder > 0) {
                poolAmount += 1;
                remainder -= 1;
            }
            m.outcomePools.push(poolAmount);
        }

        emit MarketCreated(marketId, marketType, question, endTime);
    }

    function resolveMarket(uint256 marketId, uint256 outcome) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.marketType == MarketType.Scalar) revert NotDiscreteMarket();
        if (m.status == MarketStatus.Cancelled || m.status == MarketStatus.Resolved) revert InvalidStatus();
        if (block.timestamp < m.resolutionTime) revert NotResolvable();
        if (outcome >= m.outcomes.length) revert InvalidOutcome();

        m.status = MarketStatus.Resolved;
        m.resolvedOutcome = outcome;

        emit MarketResolved(marketId, outcome, 0);
    }

    function resolveScalarMarket(uint256 marketId, int256 value) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.marketType != MarketType.Scalar) revert NotScalarMarket();
        if (m.status == MarketStatus.Cancelled || m.status == MarketStatus.Resolved) revert InvalidStatus();
        if (block.timestamp < m.resolutionTime) revert NotResolvable();
        if (value < m.scalarLow || value > m.scalarHigh) revert InvalidOutcome();

        m.status = MarketStatus.Resolved;
        m.resolvedScalarValue = value;

        emit MarketResolved(marketId, 0, value);
    }

    function cancelMarket(uint256 marketId) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.status == MarketStatus.Resolved || m.status == MarketStatus.Cancelled) revert InvalidStatus();
        m.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    /// @notice Permissionless safety valve that cancels an unresolved market after the grace period.
    function emergencyRefund(uint256 marketId) external {
        Market storage m = _getMarket(marketId);
        if (m.status != MarketStatus.Open && m.status != MarketStatus.Closed) revert InvalidStatus();
        if (block.timestamp < m.resolutionTime + RESOLUTION_GRACE_PERIOD) revert NotResolvable();

        m.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    function closeMarket(uint256 marketId) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.status != MarketStatus.Open) revert InvalidStatus();
        m.status = MarketStatus.Closed;
        emit MarketClosed(marketId);
    }

    function setMarketPriceFeed(uint256 marketId, address feed, uint256 maxStaleness) external onlyOwner {
        Market storage m = _getMarket(marketId);
        if (m.marketType != MarketType.Scalar) revert NotScalarMarket();
        if (feed == address(0)) revert InvalidAddress();
        if (maxStaleness == 0) revert InvalidTimes();

        _marketPriceFeed[marketId] = feed;
        _marketFeedStaleness[marketId] = maxStaleness;

        emit PriceFeedSet(marketId, feed);
    }

    function autoResolveScalarMarket(uint256 marketId) external {
        Market storage m = _getMarket(marketId);
        if (m.marketType != MarketType.Scalar) revert NotScalarMarket();
        if (m.status == MarketStatus.Cancelled || m.status == MarketStatus.Resolved) revert InvalidStatus();
        if (block.timestamp < m.resolutionTime) revert NotResolvable();

        address feed = _marketPriceFeed[marketId];
        if (feed == address(0)) revert InvalidAddress();

        (, int256 answer,, uint256 updatedAt,) = IChainlinkFeed(feed).latestRoundData();

        uint256 maxStaleness = _marketFeedStaleness[marketId];
        if (maxStaleness == 0) {
            maxStaleness = 3600;
        }

        if (updatedAt < block.timestamp - maxStaleness) revert NotResolvable();

        int256 clampedAnswer = answer;
        if (clampedAnswer < m.scalarLow) {
            clampedAnswer = m.scalarLow;
        } else if (clampedAnswer > m.scalarHigh) {
            clampedAnswer = m.scalarHigh;
        }

        m.status = MarketStatus.Resolved;
        m.resolvedScalarValue = clampedAnswer;

        emit MarketResolved(marketId, 0, clampedAnswer);
    }

    function featureMarket(uint256 marketId, bool featured) external onlyOwner {
        Market storage m = _getMarket(marketId);
        m.featured = featured;
    }

    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        _feeBps = newFeeBps;
        emit FeeSet(newFeeBps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        _feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = _accruedProtocolFees;
        if (amount == 0) revert NothingToRedeem();
        _accruedProtocolFees = 0;
        usdc.safeTransfer(_feeRecipient, amount);
    }

    function setMinLiquidity(uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidLiquidity();
        _minLiquidity = amount;
        emit MinLiquiditySet(amount);
    }

    function buyShares(
        uint256 marketId,
        uint256 outcomeIndex,
        uint256 usdcAmount,
        uint256 minSharesOut
    ) external nonReentrant returns (uint256 sharesOut) {
        Market storage m = _getMarket(marketId);
        _requireTradeable(m);
        _validateOutcome(m, outcomeIndex);
        if (usdcAmount == 0) revert InvalidLiquidity();

        uint256 fee = (usdcAmount * _feeBps) / BPS_DENOMINATOR;
        uint256 netIn = usdcAmount - fee;
        if (netIn == 0) revert InvalidLiquidity();

        sharesOut = _previewSharesOut(m, outcomeIndex, usdcAmount);
        if (sharesOut < minSharesOut || sharesOut == 0) revert SlippageExceeded();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 shareUsdc = sharesOut / USDC_DECIMALS_MULTIPLIER;
        uint256 oldPoolX = m.outcomePools[outcomeIndex];
        uint256 otherSum = m.totalLiquidity - oldPoolX;

        if (otherSum == 0 || shareUsdc >= oldPoolX) revert InvalidLiquidity();

        uint256 newPoolX = oldPoolX - shareUsdc;
        m.outcomePools[outcomeIndex] = newPoolX;
        _distributeAcrossOtherOutcomes(m, outcomeIndex, netIn, true);

        m.totalLiquidity += netIn;
        m.feesCollected += fee;
        _accruedProtocolFees += fee;

        _userShares[marketId][msg.sender][outcomeIndex] += sharesOut;
        _totalOutstandingShares[marketId][outcomeIndex] += sharesOut;
        _userNetCost[marketId][msg.sender] += usdcAmount;
        _touchUserMarket(msg.sender, marketId);

        emit SharesBought(marketId, msg.sender, outcomeIndex, usdcAmount, sharesOut);
    }

    function sellShares(
        uint256 marketId,
        uint256 outcomeIndex,
        uint256 sharesAmount,
        uint256 minUsdcOut
    ) external nonReentrant returns (uint256 usdcOut) {
        Market storage m = _getMarket(marketId);
        _requireTradeable(m);
        _validateOutcome(m, outcomeIndex);

        uint256 userBal = _userShares[marketId][msg.sender][outcomeIndex];
        if (sharesAmount == 0 || sharesAmount > userBal) revert InsufficientShares();

        usdcOut = _previewUsdcOut(m, outcomeIndex, sharesAmount);
        if (usdcOut < minUsdcOut || usdcOut == 0) revert SlippageExceeded();

        uint256 shareUsdc = sharesAmount / USDC_DECIMALS_MULTIPLIER;
        if (shareUsdc == 0) revert InvalidLiquidity();

        uint256 oldPoolX = m.outcomePools[outcomeIndex];
        uint256 oldOtherSum = m.totalLiquidity - oldPoolX;
        uint256 newPoolX = oldPoolX + shareUsdc;
        uint256 k = oldPoolX * oldOtherSum;
        uint256 newOtherSum = k / newPoolX;
        uint256 grossOut = oldOtherSum - newOtherSum;

        uint256 fee = (grossOut * _feeBps) / BPS_DENOMINATOR;
        uint256 netOut = grossOut - fee;

        if (netOut == 0) revert SlippageExceeded();

        m.outcomePools[outcomeIndex] = newPoolX;
        _distributeAcrossOtherOutcomes(m, outcomeIndex, grossOut, false);
        m.totalLiquidity -= grossOut;
        m.feesCollected += fee;
        _accruedProtocolFees += fee;

        _userShares[marketId][msg.sender][outcomeIndex] = userBal - sharesAmount;
        _totalOutstandingShares[marketId][outcomeIndex] -= sharesAmount;

        uint256 basis = _userNetCost[marketId][msg.sender];
        _userNetCost[marketId][msg.sender] = netOut >= basis ? 0 : basis - netOut;

        usdc.safeTransfer(msg.sender, netOut);

        emit SharesSold(marketId, msg.sender, outcomeIndex, sharesAmount, netOut);

        return netOut;
    }

    function redeemWinnings(uint256 marketId) external nonReentrant returns (uint256 amount) {
        Market storage m = _getMarket(marketId);
        if (m.status != MarketStatus.Resolved && m.status != MarketStatus.Cancelled) revert InvalidStatus();
        if (_redeemed[marketId][msg.sender]) revert AlreadyRedeemed();

        _redeemed[marketId][msg.sender] = true;

        if (m.status == MarketStatus.Cancelled) {
            amount = _userNetCost[marketId][msg.sender];
            _userNetCost[marketId][msg.sender] = 0;
            _clearUserShares(marketId, msg.sender, m.outcomes.length);
            if (amount == 0) revert NothingToRedeem();
            usdc.safeTransfer(msg.sender, amount);
            emit WinningsRedeemed(marketId, msg.sender, amount);
            return amount;
        }

        if (m.marketType == MarketType.Scalar) {
            amount = _computeScalarPayout(marketId, msg.sender, m);
        } else {
            uint256 winningShares = _userShares[marketId][msg.sender][m.resolvedOutcome];
            amount = winningShares / USDC_DECIMALS_MULTIPLIER;
        }

        _userNetCost[marketId][msg.sender] = 0;
        _clearUserShares(marketId, msg.sender, m.outcomes.length);

        if (amount == 0) revert NothingToRedeem();

        usdc.safeTransfer(msg.sender, amount);
        emit WinningsRedeemed(marketId, msg.sender, amount);
    }

    function addLiquidity(uint256 marketId, uint256 usdcAmount) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.status == MarketStatus.Resolved || m.status == MarketStatus.Cancelled) revert InvalidStatus();
        if (usdcAmount == 0) revert InvalidLiquidity();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        _distributeAcrossAllOutcomes(m, usdcAmount, true);
        m.totalLiquidity += usdcAmount;

        emit LiquidityAdded(marketId, usdcAmount);
    }

    function removeLiquidity(uint256 marketId, uint256 usdcAmount) external onlyOwner nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.status == MarketStatus.Resolved || m.status == MarketStatus.Cancelled) revert InvalidStatus();
        if (usdcAmount == 0 || usdcAmount >= m.totalLiquidity) revert InvalidLiquidity();

        _distributeAcrossAllOutcomes(m, usdcAmount, false);
        m.totalLiquidity -= usdcAmount;

        usdc.safeTransfer(msg.sender, usdcAmount);
        emit LiquidityRemoved(marketId, usdcAmount);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _getMarket(marketId);
    }

    function getAllMarkets() external view returns (Market[] memory allMarkets) {
        uint256 len = _marketIds.length;
        allMarkets = new Market[](len);
        for (uint256 i = 0; i < len; i++) {
            allMarkets[i] = _markets[_marketIds[i]];
        }
    }

    function getOpenMarkets() external view returns (uint256[] memory openIds) {
        uint256 len = _marketIds.length;
        uint256[] memory temp = new uint256[](len);
        uint256 count;

        for (uint256 i = 0; i < len; i++) {
            uint256 marketId = _marketIds[i];
            Market storage m = _markets[marketId];
            if (m.status == MarketStatus.Open && block.timestamp < m.endTime) {
                temp[count++] = marketId;
            }
        }

        openIds = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            openIds[j] = temp[j];
        }
    }

    function getUserShares(uint256 marketId, address user, uint256 outcomeIndex) external view returns (uint256) {
        return _userShares[marketId][user][outcomeIndex];
    }

    function getMarketPrice(uint256 marketId, uint256 outcomeIndex) external view returns (uint256) {
        Market storage m = _getMarket(marketId);
        _validateOutcome(m, outcomeIndex);

        uint256 len = m.outcomePools.length;
        uint256[] memory inverses = new uint256[](len);
        uint256 sumInv;

        for (uint256 i = 0; i < len; i++) {
            uint256 pool = m.outcomePools[i];
            if (pool == 0) return 0;
            uint256 inv = 1e36 / pool;
            inverses[i] = inv;
            sumInv += inv;
        }

        if (sumInv == 0) return 0;
        return (inverses[outcomeIndex] * 1e6) / sumInv;
    }

    function getSharesOut(uint256 marketId, uint256 outcomeIndex, uint256 usdcIn) external view returns (uint256) {
        Market storage m = _getMarket(marketId);
        _validateOutcome(m, outcomeIndex);
        return _previewSharesOut(m, outcomeIndex, usdcIn);
    }

    function getUsdcOut(uint256 marketId, uint256 outcomeIndex, uint256 sharesIn) external view returns (uint256) {
        Market storage m = _getMarket(marketId);
        _validateOutcome(m, outcomeIndex);
        return _previewUsdcOut(m, outcomeIndex, sharesIn);
    }

    function getTotalMarkets() external view returns (uint256) {
        return _marketCount;
    }

    function getUserMarketPositions(address user) external view returns (uint256[] memory marketIds) {
        uint256[] storage touched = _userTouchedMarkets[user];
        uint256 len = touched.length;
        uint256[] memory temp = new uint256[](len);
        uint256 count;

        for (uint256 i = 0; i < len; i++) {
            uint256 marketId = touched[i];
            Market storage m = _markets[marketId];
            uint256 totalUserShares;
            for (uint256 j = 0; j < m.outcomes.length; j++) {
                totalUserShares += _userShares[marketId][user][j];
            }
            if (totalUserShares > 0) {
                temp[count++] = marketId;
            }
        }

        marketIds = new uint256[](count);
        for (uint256 k = 0; k < count; k++) {
            marketIds[k] = temp[k];
        }
    }

    function platformFee() external view returns (uint256) {
        return _feeBps;
    }

    function feeRecipient() external view returns (address) {
        return _feeRecipient;
    }

    function minLiquidity() external view returns (uint256) {
        return _minLiquidity;
    }

    function accruedFees() external view returns (uint256) {
        return _accruedProtocolFees;
    }

    function totalOutstandingShares(uint256 marketId, uint256 outcomeIndex) external view returns (uint256) {
        return _totalOutstandingShares[marketId][outcomeIndex];
    }

    function userCostBasis(uint256 marketId, address user) external view returns (uint256) {
        return _userNetCost[marketId][user];
    }

    function _getMarket(uint256 marketId) internal view returns (Market storage m) {
        m = _markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
    }

    function _validateOutcome(Market storage m, uint256 outcomeIndex) internal view {
        if (outcomeIndex >= m.outcomes.length) revert InvalidOutcome();
    }

    function _requireTradeable(Market storage m) internal view {
        if (m.status != MarketStatus.Open) revert InvalidStatus();
        if (block.timestamp >= m.endTime) revert TradingClosed();
    }

    function _touchUserMarket(address user, uint256 marketId) internal {
        if (!_userTouchedMarketFlag[user][marketId]) {
            _userTouchedMarketFlag[user][marketId] = true;
            _userTouchedMarkets[user].push(marketId);
        }
    }

    function _previewSharesOut(Market storage m, uint256 outcomeIndex, uint256 usdcAmount) internal view returns (uint256) {
        if (usdcAmount == 0) return 0;

        uint256 fee = (usdcAmount * _feeBps) / BPS_DENOMINATOR;
        uint256 netIn = usdcAmount - fee;
        if (netIn == 0) return 0;

        uint256 poolX = m.outcomePools[outcomeIndex];
        uint256 otherSum = m.totalLiquidity - poolX;
        if (otherSum == 0) return 0;

        uint256 k = poolX * otherSum;
        uint256 newOtherSum = otherSum + netIn;
        uint256 newPoolX = k / newOtherSum;

        if (newPoolX >= poolX) return 0;

        uint256 shareUsdc = poolX - newPoolX;
        return shareUsdc * USDC_DECIMALS_MULTIPLIER;
    }

    function _previewUsdcOut(Market storage m, uint256 outcomeIndex, uint256 sharesAmount) internal view returns (uint256) {
        if (sharesAmount == 0) return 0;

        uint256 shareUsdc = sharesAmount / USDC_DECIMALS_MULTIPLIER;
        if (shareUsdc == 0) return 0;

        uint256 poolX = m.outcomePools[outcomeIndex];
        uint256 otherSum = m.totalLiquidity - poolX;
        if (otherSum == 0) return 0;

        uint256 newPoolX = poolX + shareUsdc;
        uint256 k = poolX * otherSum;
        uint256 newOtherSum = k / newPoolX;
        if (newOtherSum >= otherSum) return 0;

        uint256 grossOut = otherSum - newOtherSum;
        uint256 fee = (grossOut * _feeBps) / BPS_DENOMINATOR;
        return grossOut - fee;
    }

    function _distributeAcrossOtherOutcomes(
        Market storage m,
        uint256 outcomeIndex,
        uint256 amount,
        bool increase
    ) internal {
        uint256 len = m.outcomePools.length;
        if (len <= 1 || amount == 0) return;

        uint256 otherSum;
        for (uint256 i = 0; i < len; i++) {
            if (i != outcomeIndex) {
                otherSum += m.outcomePools[i];
            }
        }

        if (otherSum == 0) return;

        uint256 distributed;
        for (uint256 j = 0; j < len; j++) {
            if (j == outcomeIndex) continue;
            uint256 delta = (amount * m.outcomePools[j]) / otherSum;
            if (increase) {
                m.outcomePools[j] += delta;
            } else {
                m.outcomePools[j] -= delta;
            }
            distributed += delta;
        }

        uint256 remainder = amount - distributed;
        if (remainder == 0) return;

        for (uint256 k = 0; k < len && remainder > 0; k++) {
            if (k == outcomeIndex) continue;
            if (increase) {
                m.outcomePools[k] += 1;
                remainder -= 1;
            } else {
                if (m.outcomePools[k] > 0) {
                    m.outcomePools[k] -= 1;
                    remainder -= 1;
                }
            }
        }
    }

    function _distributeAcrossAllOutcomes(Market storage m, uint256 amount, bool increase) internal {
        uint256 len = m.outcomePools.length;
        uint256 total = m.totalLiquidity;
        uint256 distributed;

        if (increase) {
            if (total == 0) {
                uint256 eq = amount / len;
                uint256 rem = amount - (eq * len);
                for (uint256 i = 0; i < len; i++) {
                    uint256 addAmount = eq;
                    if (rem > 0) {
                        addAmount += 1;
                        rem -= 1;
                    }
                    m.outcomePools[i] += addAmount;
                }
                return;
            }

            for (uint256 j = 0; j < len; j++) {
                uint256 delta = (amount * m.outcomePools[j]) / total;
                m.outcomePools[j] += delta;
                distributed += delta;
            }

            uint256 remainder = amount - distributed;
            for (uint256 k = 0; k < len && remainder > 0; k++) {
                m.outcomePools[k] += 1;
                remainder -= 1;
            }
        } else {
            if (amount >= total) revert InvalidLiquidity();
            for (uint256 x = 0; x < len; x++) {
                uint256 delta = (amount * m.outcomePools[x]) / total;
                if (delta >= m.outcomePools[x]) revert InvalidLiquidity();
                m.outcomePools[x] -= delta;
                distributed += delta;
            }

            uint256 remRemove = amount - distributed;
            for (uint256 y = 0; y < len && remRemove > 0; y++) {
                if (m.outcomePools[y] > 0) {
                    m.outcomePools[y] -= 1;
                    remRemove -= 1;
                }
            }
        }
    }

    function _computeScalarPayout(
        uint256 marketId,
        address user,
        Market storage m
    ) internal view returns (uint256) {
        uint256 lowShares = _userShares[marketId][user][0];
        uint256 highShares = _userShares[marketId][user][1];

        if (lowShares == 0 && highShares == 0) return 0;

        int256 range = m.scalarHigh - m.scalarLow;
        if (range <= 0) return 0;

        uint256 ratioHigh = (uint256(int256(m.resolvedScalarValue - m.scalarLow)) * 1e18) / uint256(range);
        if (ratioHigh > 1e18) ratioHigh = 1e18;
        uint256 ratioLow = 1e18 - ratioHigh;

        uint256 weightedShares = ((lowShares * ratioLow) / 1e18) + ((highShares * ratioHigh) / 1e18);
        return weightedShares / USDC_DECIMALS_MULTIPLIER;
    }

    function _clearUserShares(uint256 marketId, address user, uint256 outcomesLen) internal {
        for (uint256 i = 0; i < outcomesLen; i++) {
            _userShares[marketId][user][i] = 0;
        }
    }
}
