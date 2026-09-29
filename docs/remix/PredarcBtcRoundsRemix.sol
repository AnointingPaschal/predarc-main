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
//  • Minimum initial liquidity defaults to 0 (free market creation). Change it any time with
//    setMinLiquidity(amount) — amounts use 6 decimals. A market created with 0 liquidity cannot
//    be traded until the owner funds it with addLiquidity(marketId, amount).
//  • Version 2 adds: market editing (updateMarketInfo / updateMarketTimes), onchain comments
//    (postComment / deleteComment / reactToComment — stored in events), and contractVersion().
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

// ───── contracts/PredarcBtcRounds.sol ─────
interface IBtcFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/// @title PredarcBtcRounds — "Bitcoin Up or Down" every N minutes (default 5)
/// @notice Parimutuel rounds: no liquidity needed, always solvent, fully automatic.
///
///  Time is cut into fixed rounds of `duration` seconds; round `id` covers [id*duration, (id+1)*duration).
///  Bets on round `id` are accepted until it starts. One BTC price is recorded at every round boundary k
///  (recordBoundary). Round `id` compares boundary price P[id] (price to beat) with P[id+1]:
///      P[id+1] >  P[id]  → UP wins        P[id+1] <  P[id]  → DOWN wins
///  Winners share the whole pool (minus the fee) pro rata to their stake.
///  Refunds (no fee) when: prices are equal, nobody backed the winning side, or a boundary price was not
///  recorded within `buffer` seconds of the boundary (so nothing can be settled by guesswork).
///
///  Price source: if `feed` is set (Chainlink-compatible aggregator, 8 decimals) anyone can record a boundary
///  and the price comes from the feed. Otherwise only keepers / the owner can, supplying the price (1e8).
contract PredarcBtcRounds is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Upcoming, Live, Pending, SettledUp, SettledDown, Void }

    struct Stake { uint128 up; uint128 down; bool claimed; }

    IERC20 public immutable usdc;
    uint256 public immutable duration;      // seconds per round

    bool public enabled = true;             // owner can pause new bets
    uint256 public feeBps;                  // taken from settled pools
    uint256 public minBet = 100_000;        // 0.10 USDC
    uint256 public maxBet = 0;              // 0 = no limit
    uint256 public buffer = 60;             // seconds after a boundary in which its price may be recorded
    uint256 public constant MAX_AHEAD = 3;  // bets allowed on up to 3 upcoming rounds
    uint256 public constant MAX_FEE_BPS = 1000;

    address public feed;                    // 0 = keeper mode
    uint256 public maxStaleness = 120;      // feed answers older than this are rejected

    address public feeRecipient;
    uint256 public accruedFees;
    mapping(address => bool) public keepers;

    mapping(uint256 => uint256) public boundaryPrice;   // boundary index k → price (1e8), 0 = not recorded
    mapping(uint256 => uint256) public upPool;
    mapping(uint256 => uint256) public downPool;
    mapping(uint256 => bool) public feeSwept;
    mapping(uint256 => mapping(address => Stake)) private _stakes;

    event RoundBet(uint256 indexed roundId, address indexed user, bool up, uint256 amount);
    event BoundaryRecorded(uint256 indexed boundary, uint256 price, address indexed by);
    event Claimed(uint256 indexed roundId, address indexed user, uint256 amount, bool refund);
    event SettingsChanged();
    event KeeperSet(address indexed keeper, bool allowed);

    error Paused();
    error BadAmount();
    error BadRound();
    error TooEarly();
    error TooLate();
    error AlreadyRecorded();
    error NotKeeper();
    error StalePrice();
    error NothingToClaim();
    error NotFinished();
    error InvalidSetting();

    constructor(address usdc_, address feeRecipient_, uint256 duration_, uint256 feeBps_) Ownable(msg.sender) {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) revert InvalidSetting();
        if (duration_ < 60 || duration_ > 1 days || feeBps_ > MAX_FEE_BPS) revert InvalidSetting();
        usdc = IERC20(usdc_);
        duration = duration_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    // ── Betting ────────────────────────────────────────────────────────────────

    function currentBoundary() public view returns (uint256) {
        return block.timestamp / duration;
    }

    /// @notice Bet on round `roundId` (it must not have started yet, and be at most MAX_AHEAD rounds away).
    function bet(uint256 roundId, bool up, uint256 amount) external nonReentrant {
        if (!enabled) revert Paused();
        uint256 cur = currentBoundary();
        if (roundId <= cur || roundId > cur + MAX_AHEAD) revert BadRound();
        if (amount < minBet || (maxBet != 0 && amount > maxBet) || amount > type(uint128).max) revert BadAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        Stake storage s = _stakes[roundId][msg.sender];
        if (up) { s.up += uint128(amount); upPool[roundId] += amount; }
        else { s.down += uint128(amount); downPool[roundId] += amount; }
        emit RoundBet(roundId, msg.sender, up, amount);
    }

    // ── Prices ────────────────────────────────────────────────────────────────

    /// @notice Record the BTC price for the current round boundary. Callable once per boundary, within `buffer`
    ///         seconds after it. With a feed set anyone can call it (`price` is ignored); otherwise keepers only.
    function recordBoundary(uint256 boundary, uint256 price) external {
        uint256 t = boundary * duration;
        if (block.timestamp < t) revert TooEarly();
        if (block.timestamp > t + buffer) revert TooLate();
        if (boundaryPrice[boundary] != 0) revert AlreadyRecorded();

        uint256 p;
        if (feed != address(0)) {
            (, int256 answer, , uint256 updatedAt, ) = IBtcFeed(feed).latestRoundData();
            if (answer <= 0 || block.timestamp > updatedAt + maxStaleness) revert StalePrice();
            uint8 d = IBtcFeed(feed).decimals();
            p = d == 8 ? uint256(answer) : d > 8 ? uint256(answer) / (10 ** (d - 8)) : uint256(answer) * (10 ** (8 - d));
        } else {
            if (!keepers[msg.sender] && msg.sender != owner()) revert NotKeeper();
            p = price;
        }
        if (p == 0) revert BadAmount();
        boundaryPrice[boundary] = p;
        emit BoundaryRecorded(boundary, p, msg.sender);
    }

    // ── Round state ───────────────────────────────────────────────────────────

    function roundStatus(uint256 roundId) public view returns (Status) {
        uint256 start = roundId * duration;
        if (block.timestamp < start) return Status.Upcoming;

        uint256 lockP = boundaryPrice[roundId];
        if (lockP == 0) return block.timestamp > start + buffer ? Status.Void : Status.Live;

        uint256 end = start + duration;
        if (block.timestamp < end) return Status.Live;

        uint256 closeP = boundaryPrice[roundId + 1];
        if (closeP == 0) return block.timestamp > end + buffer ? Status.Void : Status.Pending;

        if (upPool[roundId] == 0 || downPool[roundId] == 0 || closeP == lockP) return Status.Void;
        return closeP > lockP ? Status.SettledUp : Status.SettledDown;
    }

    struct RoundInfo {
        uint256 start;
        uint256 lockPrice;
        uint256 closePrice;
        uint256 upTotal;
        uint256 downTotal;
        Status status;
    }

    function roundInfo(uint256 roundId) external view returns (RoundInfo memory r) {
        r.start = roundId * duration;
        r.lockPrice = boundaryPrice[roundId];
        r.closePrice = boundaryPrice[roundId + 1];
        r.upTotal = upPool[roundId];
        r.downTotal = downPool[roundId];
        r.status = roundStatus(roundId);
    }

    function stakeOf(uint256 roundId, address user) external view returns (uint256 up, uint256 down, bool claimed) {
        Stake storage s = _stakes[roundId][user];
        return (s.up, s.down, s.claimed);
    }

    /// @notice What `user` would receive from claim(roundId) right now (0 if nothing / already claimed / not finished).
    function claimable(uint256 roundId, address user) public view returns (uint256 amount, bool refund) {
        Stake storage s = _stakes[roundId][user];
        if (s.claimed || (s.up == 0 && s.down == 0)) return (0, false);
        Status st = roundStatus(roundId);
        if (st == Status.Void) return (uint256(s.up) + uint256(s.down), true);
        if (st != Status.SettledUp && st != Status.SettledDown) return (0, false);
        uint256 total = upPool[roundId] + downPool[roundId];
        uint256 net = total - (total * feeBps) / 10_000;
        if (st == Status.SettledUp) return (s.up == 0 ? 0 : (uint256(s.up) * net) / upPool[roundId], false);
        return (s.down == 0 ? 0 : (uint256(s.down) * net) / downPool[roundId], false);
    }

    /// @notice Withdraw winnings (or a refund) for a finished round.
    function claim(uint256 roundId) external nonReentrant returns (uint256 amount) {
        Stake storage s = _stakes[roundId][msg.sender];
        if (s.claimed) revert NothingToClaim();
        Status st = roundStatus(roundId);
        if (st == Status.Upcoming || st == Status.Live || st == Status.Pending) revert NotFinished();

        bool refund;
        (amount, refund) = claimable(roundId, msg.sender);
        if (amount == 0) revert NothingToClaim();
        s.claimed = true;
        if (!refund) _sweepFee(roundId);
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(roundId, msg.sender, amount, refund);
    }

    /// @notice Move a settled round's fee into `accruedFees` (anyone may call).
    function sweepFee(uint256 roundId) external {
        Status st = roundStatus(roundId);
        if (st != Status.SettledUp && st != Status.SettledDown) revert NotFinished();
        _sweepFee(roundId);
    }

    function _sweepFee(uint256 roundId) internal {
        if (feeSwept[roundId]) return;
        feeSwept[roundId] = true;
        accruedFees += ((upPool[roundId] + downPool[roundId]) * feeBps) / 10_000;
    }

    // ── Owner ─────────────────────────────────────────────────────────────────

    function setEnabled(bool on) external onlyOwner { enabled = on; emit SettingsChanged(); }

    function setFee(uint256 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidSetting();
        feeBps = bps; emit SettingsChanged();
    }

    function setBetLimits(uint256 min_, uint256 max_) external onlyOwner {
        if (min_ == 0 || (max_ != 0 && max_ < min_)) revert InvalidSetting();
        minBet = min_; maxBet = max_; emit SettingsChanged();
    }

    function setBuffer(uint256 seconds_) external onlyOwner {
        if (seconds_ < 10 || seconds_ > duration / 2) revert InvalidSetting();
        buffer = seconds_; emit SettingsChanged();
    }

    /// @param feed_ Chainlink-compatible BTC/USD aggregator, or address(0) for keeper mode.
    function setFeed(address feed_, uint256 maxStaleness_) external onlyOwner {
        if (maxStaleness_ == 0) revert InvalidSetting();
        feed = feed_; maxStaleness = maxStaleness_; emit SettingsChanged();
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        keepers[keeper] = allowed; emit KeeperSet(keeper, allowed);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidSetting();
        feeRecipient = recipient; emit SettingsChanged();
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToClaim();
        accruedFees = 0;
        usdc.safeTransfer(feeRecipient, amount);
    }

    function contractVersion() external pure returns (uint256) { return 1; }
}
