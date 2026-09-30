// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PredarcSports: soccer betting lines (1X2, double chance, over/under, GG/NG, ...) in USDC
/// @notice Every line is a fixed-product market maker (the design Omen/Gnosis use). One share pays exactly 1 USDC if
///         its outcome wins, and every share is backed by a complete set, so the contract is solvent by construction.
///         A line opens at chosen probabilities (real bookmaker odds), so odds are not all equal at the start.
///         The owner creates matches and seeds liquidity; the owner or an authorised resolver (a keeper wallet that
///         holds no other power) settles them from the final score.
contract PredarcSports is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Resolved, Cancelled }

    struct Line {
        uint256 id;
        uint256 matchId;          // external match id (ESPN event id)
        string kind;              // "1x2", "ou_2.5", "btts", ...
        string question;
        string[] outcomes;
        uint256[] pools;          // outcome tokens held by the pool (USDC units, 6 decimals)
        uint256 endTime;          // betting closes (kick-off)
        uint256 resolveTime;      // earliest time the result can be entered
        Status status;
        uint256 winning;
        uint256 liquidity;        // USDC the owner put in when the line was created
        uint256 sets;             // complete sets currently backing the line
        uint256 fees;             // fees collected on this line (refunded if it is cancelled)
        uint256 netCostTotal;     // sum of every bettor's net cost (for refunds)
    }

    uint256 public constant MAX_OUTCOMES = 6;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant EMERGENCY_DELAY = 14 days;
    uint256 private constant ONE = 1e18;

    IERC20 public immutable usdc;
    address public feeRecipient;
    uint256 public feeBps;
    uint256 public minBet = 100_000;             // 0.10 USDC
    uint256 public minLiquidity = 1_000_000;     // 1 USDC per line
    uint256 public accruedFees;
    mapping(address => bool) public resolvers;

    uint256 private _count;
    mapping(uint256 => Line) private _lines;
    mapping(uint256 => uint256[]) private _matchLines;
    uint256[] private _matches;
    mapping(uint256 => bool) public matchExists;
    mapping(uint256 => mapping(address => uint256[])) private _shares;   // line => user => shares per outcome
    mapping(uint256 => mapping(address => uint256)) public netCost;      // line => user => USDC paid in, net of sells
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => bool) public liquidityWithdrawn;
    mapping(address => uint256[]) private _userLines;
    mapping(uint256 => mapping(address => bool)) private _userTouched;

    error InvalidLine();
    error InvalidOdds();
    error InvalidAmount();
    error NotAuthorised();
    error BettingClosed();
    error NotResolvable();
    error InvalidStatus();
    error Slippage();
    error NothingToClaim();
    error InvalidFee();

    event MatchCreated(uint256 indexed matchId, uint256 endTime, uint256 lines);
    event LineCreated(uint256 indexed lineId, uint256 indexed matchId, string kind, uint256 endTime);
    event Bought(uint256 indexed lineId, address indexed user, uint256 outcome, uint256 amountIn, uint256 sharesOut);
    event Sold(uint256 indexed lineId, address indexed user, uint256 outcome, uint256 sharesIn, uint256 amountOut);
    event Resolved(uint256 indexed lineId, uint256 winning);
    event Cancelled(uint256 indexed lineId);
    event Claimed(uint256 indexed lineId, address indexed user, uint256 amount);
    event ResolverSet(address indexed resolver, bool allowed);

    constructor(address usdc_, address feeRecipient_, uint256 feeBps_) Ownable(msg.sender) {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) revert InvalidLine();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        usdc = IERC20(usdc_);
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    modifier onlyResolver() {
        if (msg.sender != owner() && !resolvers[msg.sender]) revert NotAuthorised();
        _;
    }

    // ───────────────────────────── creating matches ─────────────────────────────

    /// @notice Creates every betting line of one match in a single transaction. `probsBps[i]` are the opening
    ///         probabilities of line i's outcomes (basis points, summing to about 10000).
    function createMatch(
        uint256 matchId,
        uint256 endTime,
        uint256 resolveTime,
        string[] calldata kinds,
        string[] calldata questions,
        string[][] calldata outcomes,
        uint256[][] calldata probsBps,
        uint256 liquidityPerLine
    ) external onlyOwner nonReentrant returns (uint256[] memory ids) {
        uint256 n = kinds.length;
        if (n == 0 || n > 24 || questions.length != n || outcomes.length != n || probsBps.length != n) revert InvalidLine();
        if (endTime <= block.timestamp || resolveTime < endTime) revert InvalidLine();
        if (liquidityPerLine < minLiquidity) revert InvalidAmount();
        if (!matchExists[matchId]) { matchExists[matchId] = true; _matches.push(matchId); }

        usdc.safeTransferFrom(msg.sender, address(this), liquidityPerLine * n);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = _createLine(matchId, kinds[i], questions[i], outcomes[i], probsBps[i], endTime, resolveTime, liquidityPerLine);
        }
        emit MatchCreated(matchId, endTime, n);
    }

    function _createLine(
        uint256 matchId, string calldata kind, string calldata question, string[] calldata outs,
        uint256[] calldata probs, uint256 endTime, uint256 resolveTime, uint256 liquidity
    ) internal returns (uint256 id) {
        uint256 k = outs.length;
        if (k < 2 || k > MAX_OUTCOMES || probs.length != k) revert InvalidLine();
        uint256 sumP;
        uint256 maxW;
        uint256[] memory w = new uint256[](k);
        for (uint256 i = 0; i < k; i++) {
            uint256 p = probs[i];
            if (p < 100 || p > 9900) revert InvalidOdds();
            sumP += p;
            w[i] = 1e24 / p;          // pool size is inversely proportional to probability
            if (w[i] > maxW) maxW = w[i];
        }
        if (sumP < 9950 || sumP > 10050) revert InvalidOdds();

        id = ++_count;
        Line storage l = _lines[id];
        l.id = id; l.matchId = matchId; l.kind = kind; l.question = question;
        l.endTime = endTime; l.resolveTime = resolveTime; l.liquidity = liquidity; l.sets = liquidity;
        uint256[] storage mine = _shares[id][owner()];
        for (uint256 i = 0; i < k; i++) {
            l.outcomes.push(outs[i]);
            uint256 pool = (liquidity * w[i]) / maxW;     // the least likely outcome holds the full amount
            if (pool == 0) revert InvalidAmount();
            l.pools.push(pool);
            mine.push(liquidity - pool);                  // owner keeps the rest of the complete sets
        }
        _matchLines[matchId].push(id);
        _touch(id, owner());
        emit LineCreated(id, matchId, kind, endTime);
    }

    // ───────────────────────────── betting ─────────────────────────────

    function buy(uint256 lineId, uint256 outcome, uint256 amount, uint256 minShares) external nonReentrant returns (uint256 sharesOut) {
        Line storage l = _open(lineId);
        if (outcome >= l.pools.length) revert InvalidLine();
        if (amount < minBet || amount > 1_000_000e6) revert InvalidAmount();
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        sharesOut = _quoteBuy(l.pools, outcome, net);
        if (sharesOut == 0 || sharesOut < minShares) revert Slippage();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 k = l.pools.length;
        for (uint256 j = 0; j < k; j++) l.pools[j] += net;      // net complete sets minted into the pool
        l.pools[outcome] -= sharesOut;                          // the bettor takes their outcome tokens out
        l.sets += net;
        l.fees += fee;
        l.netCostTotal += amount;
        netCost[lineId][msg.sender] += amount;
        uint256[] storage s = _sharesOf(lineId, msg.sender, k);
        s[outcome] += sharesOut;
        _touch(lineId, msg.sender);
        emit Bought(lineId, msg.sender, outcome, amount, sharesOut);
    }

    /// @notice Cash out before betting closes.
    function sell(uint256 lineId, uint256 outcome, uint256 sharesIn, uint256 minOut) external nonReentrant returns (uint256 out) {
        Line storage l = _open(lineId);
        if (outcome >= l.pools.length) revert InvalidLine();
        uint256[] storage s = _sharesOf(lineId, msg.sender, l.pools.length);
        if (sharesIn == 0 || s[outcome] < sharesIn) revert InvalidAmount();
        out = _quoteSell(l.pools, outcome, sharesIn);
        if (out == 0 || out < minOut) revert Slippage();

        s[outcome] -= sharesIn;
        uint256 k = l.pools.length;
        l.pools[outcome] += sharesIn;
        for (uint256 j = 0; j < k; j++) l.pools[j] -= out;      // `out` complete sets are burned
        l.sets -= out;
        uint256 c = netCost[lineId][msg.sender];
        uint256 dec = out > c ? c : out;
        netCost[lineId][msg.sender] = c - dec;
        l.netCostTotal -= dec;
        usdc.safeTransfer(msg.sender, out);
        emit Sold(lineId, msg.sender, outcome, sharesIn, out);
    }

    // ───────────────────────────── settlement ─────────────────────────────

    function resolve(uint256 lineId, uint256 winning) external onlyResolver nonReentrant {
        Line storage l = _line(lineId);
        if (l.status != Status.Open) revert InvalidStatus();
        if (block.timestamp < l.resolveTime) revert NotResolvable();
        if (winning >= l.pools.length) revert InvalidLine();
        l.status = Status.Resolved;
        l.winning = winning;
        accruedFees += l.fees;
        emit Resolved(lineId, winning);
    }

    /// @notice Resolve many lines of finished matches in one transaction (keeper use).
    function resolveMany(uint256[] calldata lineIds, uint256[] calldata winning) external onlyResolver nonReentrant {
        if (lineIds.length != winning.length) revert InvalidLine();
        for (uint256 i = 0; i < lineIds.length; i++) {
            Line storage l = _line(lineIds[i]);
            if (l.status != Status.Open || block.timestamp < l.resolveTime || winning[i] >= l.pools.length) continue;
            l.status = Status.Resolved;
            l.winning = winning[i];
            accruedFees += l.fees;
            emit Resolved(lineIds[i], winning[i]);
        }
    }

    function cancel(uint256 lineId) external onlyResolver nonReentrant { _cancel(lineId); }

    function cancelMany(uint256[] calldata lineIds) external onlyResolver nonReentrant {
        for (uint256 i = 0; i < lineIds.length; i++) if (_line(lineIds[i]).status == Status.Open) _cancel(lineIds[i]);
    }

    /// @notice Anyone can cancel a line the resolver never settled, so money is never stuck.
    function emergencyCancel(uint256 lineId) external nonReentrant {
        Line storage l = _line(lineId);
        if (l.status != Status.Open || block.timestamp < l.resolveTime + EMERGENCY_DELAY) revert NotResolvable();
        _cancel(lineId);
    }

    function _cancel(uint256 lineId) internal {
        Line storage l = _line(lineId);
        if (l.status != Status.Open) revert InvalidStatus();
        l.status = Status.Cancelled;
        emit Cancelled(lineId);
    }

    /// @notice Winners collect 1 USDC per winning share; on a cancelled line everyone gets their money back.
    function claim(uint256 lineId) external nonReentrant returns (uint256 amount) {
        Line storage l = _line(lineId);
        if (claimed[lineId][msg.sender]) revert NothingToClaim();
        if (l.status == Status.Resolved) {
            uint256[] storage s = _shares[lineId][msg.sender];
            if (s.length == 0) revert NothingToClaim();
            amount = s[l.winning];
            s[l.winning] = 0;
        } else if (l.status == Status.Cancelled) {
            uint256 c = netCost[lineId][msg.sender];
            uint256 held = l.sets + l.fees;                    // what the contract holds for this line
            uint256 owed = l.netCostTotal;
            amount = owed > held ? (c * held) / owed : c;      // pro rata in the (unlikely) shortfall case
        } else {
            revert InvalidStatus();
        }
        if (amount == 0) revert NothingToClaim();
        claimed[lineId][msg.sender] = true;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(lineId, msg.sender, amount);
    }

    /// @notice Owner takes back the pool's leftover value once a line has ended (winning tokens left in the pool,
    ///         or the liquidity itself when the line was cancelled).
    function withdrawLiquidity(uint256 lineId) external onlyOwner nonReentrant returns (uint256 amount) {
        Line storage l = _line(lineId);
        if (liquidityWithdrawn[lineId]) revert NothingToClaim();
        if (l.status == Status.Resolved) {
            amount = l.pools[l.winning];
        } else if (l.status == Status.Cancelled) {
            uint256 held = l.sets + l.fees;
            amount = held > l.netCostTotal ? held - l.netCostTotal : 0;
        } else {
            revert InvalidStatus();
        }
        if (amount == 0) revert NothingToClaim();
        liquidityWithdrawn[lineId] = true;
        usdc.safeTransfer(msg.sender, amount);
    }

    // ───────────────────────────── admin ─────────────────────────────

    function setResolver(address who, bool allowed) external onlyOwner { resolvers[who] = allowed; emit ResolverSet(who, allowed); }
    function setFee(uint256 bps) external onlyOwner { if (bps > MAX_FEE_BPS) revert InvalidFee(); feeBps = bps; }
    function setFeeRecipient(address a) external onlyOwner { if (a == address(0)) revert InvalidLine(); feeRecipient = a; }
    function setLimits(uint256 minBet_, uint256 minLiquidity_) external onlyOwner { minBet = minBet_; minLiquidity = minLiquidity_; }
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 a = accruedFees; accruedFees = 0;
        if (a == 0) revert NothingToClaim();
        usdc.safeTransfer(feeRecipient, a);
    }

    function contractVersion() external pure returns (uint256) { return 1; }

    // ───────────────────────────── views ─────────────────────────────

    function totalLines() external view returns (uint256) { return _count; }
    function totalMatches() external view returns (uint256) { return _matches.length; }
    function getMatchIds() external view returns (uint256[] memory) { return _matches; }
    function getMatchLines(uint256 matchId) external view returns (uint256[] memory) { return _matchLines[matchId]; }
    function getLine(uint256 lineId) external view returns (Line memory) { return _line(lineId); }

    function getLines(uint256[] calldata ids) external view returns (Line[] memory out) {
        out = new Line[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = _line(ids[i]);
    }

    /// @notice Probability of each outcome (1e6 = 100%).
    function getPrices(uint256 lineId) public view returns (uint256[] memory p) {
        uint256[] storage pools = _line(lineId).pools;
        uint256 k = pools.length;
        p = new uint256[](k);
        uint256 sumInv;
        uint256[] memory inv = new uint256[](k);
        for (uint256 i = 0; i < k; i++) { inv[i] = 1e36 / pools[i]; sumInv += inv[i]; }
        for (uint256 i = 0; i < k; i++) p[i] = (inv[i] * 1e6) / sumInv;
    }

    function quoteBuy(uint256 lineId, uint256 outcome, uint256 amount) external view returns (uint256) {
        Line storage l = _line(lineId);
        if (outcome >= l.pools.length) revert InvalidLine();
        uint256 net = amount - (amount * feeBps) / 10_000;
        return _quoteBuy(l.pools, outcome, net);
    }

    function quoteSell(uint256 lineId, uint256 outcome, uint256 sharesIn) external view returns (uint256) {
        Line storage l = _line(lineId);
        if (outcome >= l.pools.length) revert InvalidLine();
        return _quoteSell(l.pools, outcome, sharesIn);
    }

    function getUserShares(uint256 lineId, address user) external view returns (uint256[] memory s) {
        uint256 k = _line(lineId).pools.length;
        s = new uint256[](k);
        uint256[] storage mine = _shares[lineId][user];
        for (uint256 i = 0; i < mine.length && i < k; i++) s[i] = mine[i];
    }

    function getUserLines(address user) external view returns (uint256[] memory) { return _userLines[user]; }

    // ───────────────────────────── internals ─────────────────────────────

    function _line(uint256 id) internal view returns (Line storage l) {
        l = _lines[id];
        if (l.id == 0) revert InvalidLine();
    }

    function _open(uint256 id) internal view returns (Line storage l) {
        l = _line(id);
        if (l.status != Status.Open || block.timestamp >= l.endTime) revert BettingClosed();
    }

    function _sharesOf(uint256 lineId, address user, uint256 k) internal returns (uint256[] storage s) {
        s = _shares[lineId][user];
        while (s.length < k) s.push(0);
    }

    function _touch(uint256 lineId, address user) internal {
        if (!_userTouched[lineId][user]) { _userTouched[lineId][user] = true; _userLines[user].push(lineId); }
    }

    /// @dev Fixed-product maker: mint `net` complete sets into the pool, then let the bettor take out as many
    ///      outcome tokens as keeps the product of the pool balances unchanged (rounded in the pool's favour).
    function _quoteBuy(uint256[] storage pools, uint256 outcome, uint256 net) internal view returns (uint256) {
        uint256 k = pools.length;
        uint256 end = pools[outcome];
        for (uint256 j = 0; j < k; j++) {
            if (j == outcome) continue;
            end = Math.mulDiv(end, pools[j], pools[j] + net, Math.Rounding.Ceil);
        }
        uint256 total = pools[outcome] + net;
        return total > end ? total - end : 0;
    }

    /// @dev Largest `r` such that burning r complete sets and adding `x` outcome tokens keeps the product >= before.
    function _quoteSell(uint256[] storage pools, uint256 outcome, uint256 x) internal view returns (uint256) {
        uint256 k = pools.length;
        uint256 hi = pools[outcome] + x;
        for (uint256 j = 0; j < k; j++) if (j != outcome && pools[j] < hi) hi = pools[j];
        uint256 lo = 0;
        // invariant holds at lo; find the largest r < hi where it still holds
        for (uint256 it = 0; it < 64 && lo < hi; it++) {
            uint256 mid = lo + (hi - lo + 1) / 2;
            if (_invariantHolds(pools, outcome, x, mid)) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    function _invariantHolds(uint256[] storage pools, uint256 outcome, uint256 x, uint256 r) internal view returns (bool) {
        uint256 k = pools.length;
        uint256 t = ONE;
        for (uint256 j = 0; j < k; j++) {
            uint256 after_ = j == outcome ? pools[j] + x - r : pools[j] - r;
            if (after_ == 0) return false;
            t = Math.mulDiv(t, after_, pools[j]);       // rounds down: conservative
        }
        return t >= ONE;
    }
}
