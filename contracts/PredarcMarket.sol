// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    event MarketUpdated(uint256 indexed marketId);
    event CommentPosted(uint256 indexed marketId, uint256 indexed commentId, address indexed author, uint256 parentId, string text);
    event CommentDeleted(uint256 indexed marketId, uint256 indexed commentId, address indexed by);
    event CommentReaction(uint256 indexed marketId, uint256 indexed commentId, address indexed user, bool liked);

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
    error InvalidComment();
    error NotCommentAuthor();

    IERC20 public immutable usdc;

    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant MAX_FEE_BPS = 500;
    uint256 private constant USDC_DECIMALS_MULTIPLIER = 1e12; // 1e18 shares / 1e6 USDC
    uint256 private constant MIN_MARKET_DURATION = 1 hours;
    uint256 private constant MIN_OUTCOMES = 2;
    uint256 private constant MAX_OUTCOMES = 10;
    uint256 private constant RESOLUTION_GRACE_PERIOD = 30 days;
    uint256 private constant MAX_COMMENT_BYTES = 600;
    uint256 private constant MAX_QUESTION_BYTES = 300;

    uint256 private _feeBps;
    address private _feeRecipient;
    uint256 private _accruedProtocolFees;
    uint256 private _marketCount;
    uint256 private _minLiquidity;
    uint256 private _commentCount;

    /// @dev Comments live in events (cheap); only authorship is kept so authors/owner can delete.
    struct CommentRef { address author; uint96 marketId; }
    mapping(uint256 => CommentRef) private _commentRefs;

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
        _minLiquidity = 0; // free market creation by default (owner can change with setMinLiquidity)
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

        if (initialLiquidity > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), initialLiquidity);
        }

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

    /// @notice Owner: edit the public details of a market that has not been resolved or cancelled.
    function updateMarketInfo(
        uint256 marketId,
        string calldata question,
        string calldata category,
        string calldata imageUrl
    ) external onlyOwner {
        Market storage m = _getMarket(marketId);
        if (m.status == MarketStatus.Resolved || m.status == MarketStatus.Cancelled) revert InvalidStatus();
        uint256 qLen = bytes(question).length;
        if (qLen == 0 || qLen > MAX_QUESTION_BYTES) revert InvalidMarket();
        m.question = question;
        m.category = category;
        m.imageUrl = imageUrl;
        emit MarketUpdated(marketId);
    }

    /// @notice Owner: move the trading end / resolution time of a market that is still open.
    function updateMarketTimes(uint256 marketId, uint256 endTime, uint256 resolutionTime) external onlyOwner {
        Market storage m = _getMarket(marketId);
        if (m.status != MarketStatus.Open) revert InvalidStatus();
        if (endTime <= block.timestamp || resolutionTime < endTime) revert InvalidTimes();
        m.endTime = endTime;
        m.resolutionTime = resolutionTime;
        emit MarketUpdated(marketId);
    }

    /// @notice Post a comment on a market. Anyone can comment; gas is the spam limit.
    /// @param parentId 0 for a top-level comment, otherwise the id of a comment on the same market.
    function postComment(uint256 marketId, string calldata text, uint256 parentId) external returns (uint256 commentId) {
        _getMarket(marketId);
        uint256 len = bytes(text).length;
        if (len == 0 || len > MAX_COMMENT_BYTES) revert InvalidComment();
        if (parentId != 0) {
            CommentRef storage p = _commentRefs[parentId];
            if (p.author == address(0) || p.marketId != marketId) revert InvalidComment();
        }
        commentId = ++_commentCount;
        _commentRefs[commentId] = CommentRef({author: msg.sender, marketId: uint96(marketId)});
        emit CommentPosted(marketId, commentId, msg.sender, parentId, text);
    }

    /// @notice The author or the owner (moderation) can hide a comment. Interfaces should honour the event.
    function deleteComment(uint256 commentId) external {
        CommentRef storage c = _commentRefs[commentId];
        if (c.author == address(0)) revert InvalidComment();
        if (msg.sender != c.author && msg.sender != owner()) revert NotCommentAuthor();
        emit CommentDeleted(c.marketId, commentId, msg.sender);
    }

    /// @notice Like or unlike a comment (latest event per user wins).
    function reactToComment(uint256 commentId, bool liked) external {
        CommentRef storage c = _commentRefs[commentId];
        if (c.author == address(0)) revert InvalidComment();
        emit CommentReaction(c.marketId, commentId, msg.sender, liked);
    }

    function totalComments() external view returns (uint256) {
        return _commentCount;
    }

    function commentAuthor(uint256 commentId) external view returns (address) {
        return _commentRefs[commentId].author;
    }

    /// @notice Feature level of this deployment: 2 = free creation, market editing, onchain comments.
    function contractVersion() external pure returns (uint256) {
        return 2;
    }

    function setMinLiquidity(uint256 amount) external onlyOwner {
        _minLiquidity = amount; // 0 = free market creation
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
