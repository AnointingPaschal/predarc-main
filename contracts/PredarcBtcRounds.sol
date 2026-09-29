// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
