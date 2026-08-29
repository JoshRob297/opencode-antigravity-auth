/**
 * Account Rotation System
 *
 * Implements advanced account selection algorithms:
 * - Health Score: Track account wellness based on success/failure
 * - LRU Selection: Prefer accounts with longest rest periods
 * - Jitter: Add random variance to break predictable patterns
 *
 * Used by 'hybrid' strategy for improved ban prevention and load distribution.
 */
export interface HealthScoreConfig {
    /** Initial score for new accounts (default: 70) */
    initial: number;
    /** Points added on successful request (default: 1) */
    successReward: number;
    /** Points removed on rate limit (default: -10) */
    rateLimitPenalty: number;
    /** Points removed on failure (auth, network, etc.) (default: -20) */
    failurePenalty: number;
    /** Points recovered per hour of rest (default: 2) */
    recoveryRatePerHour: number;
    /** Minimum score to be considered usable (default: 50) */
    minUsable: number;
    /** Maximum score cap (default: 100) */
    maxScore: number;
}
export declare const DEFAULT_HEALTH_SCORE_CONFIG: HealthScoreConfig;
/**
 * Tracks health scores for accounts.
 * Higher score = healthier account = preferred for selection.
 */
export declare class HealthScoreTracker {
    private readonly scores;
    private readonly config;
    constructor(config?: Partial<HealthScoreConfig>);
    /**
     * Get current health score for an account, applying time-based recovery.
     */
    getScore(accountIndex: number): number;
    /**
     * Record a successful request - improves health score.
     */
    recordSuccess(accountIndex: number): void;
    /**
     * Record a rate limit hit - moderate penalty.
     */
    recordRateLimit(accountIndex: number): void;
    /**
     * Record a failure (auth, network, etc.) - larger penalty.
     */
    recordFailure(accountIndex: number): void;
    /**
     * Check if account is healthy enough to use.
     */
    isUsable(accountIndex: number): boolean;
    /**
     * Get consecutive failure count for an account.
     */
    getConsecutiveFailures(accountIndex: number): number;
    /**
     * Reset health state for an account (e.g., after removal).
     */
    reset(accountIndex: number): void;
    /**
     * Get all scores for debugging/logging.
     */
    getSnapshot(): Map<number, {
        score: number;
        consecutiveFailures: number;
    }>;
}
/**
 * Add random jitter to a delay value.
 * Helps break predictable timing patterns.
 *
 * @param baseMs - Base delay in milliseconds
 * @param jitterFactor - Fraction of base to vary (default: 0.3 = ±30%)
 * @returns Jittered delay in milliseconds
 */
export declare function addJitter(baseMs: number, jitterFactor?: number): number;
/**
 * Generate a random delay within a range.
 *
 * @param minMs - Minimum delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 * @returns Random delay between min and max
 */
export declare function randomDelay(minMs: number, maxMs: number): number;
export interface AccountWithMetrics {
    index: number;
    lastUsed: number;
    healthScore: number;
    isRateLimited: boolean;
    isCoolingDown: boolean;
}
/**
 * Sort accounts by LRU (least recently used first) with health score tiebreaker.
 *
 * Priority:
 * 1. Filter out rate-limited and cooling-down accounts
 * 2. Filter out unhealthy accounts (score < minUsable)
 * 3. Sort by lastUsed ascending (oldest first = most rested)
 * 4. Tiebreaker: higher health score wins
 */
export declare function sortByLruWithHealth(accounts: AccountWithMetrics[], minHealthScore?: number): AccountWithMetrics[];
/**
 * Select account using hybrid strategy with stickiness:
 * 1. Filter available accounts (not rate-limited, not cooling down, healthy, has tokens)
 * 2. Calculate priority score: health (2x) + tokens (5x) + freshness (0.1x)
 * 3. Apply stickiness bonus to current account
 * 4. Only switch if another account beats current by SWITCH_THRESHOLD
 *
 * @param accounts - All accounts with their metrics
 * @param tokenTracker - Token bucket tracker for token balances
 * @param currentAccountIndex - Currently active account index (for stickiness)
 * @param minHealthScore - Minimum health score to be considered
 * @returns Best account index, or null if none available
 */
export declare function selectHybridAccount(accounts: AccountWithMetrics[], tokenTracker: TokenBucketTracker, currentAccountIndex?: number | null, minHealthScore?: number): number | null;
export interface TokenBucketConfig {
    /** Maximum tokens per account (default: 50) */
    maxTokens: number;
    /** Tokens regenerated per minute (default: 6) */
    regenerationRatePerMinute: number;
    /** Initial tokens for new accounts (default: 50) */
    initialTokens: number;
}
export declare const DEFAULT_TOKEN_BUCKET_CONFIG: TokenBucketConfig;
/**
 * Client-side rate limiting using Token Bucket algorithm.
 * Helps prevent hitting server 429s by tracking "cost" of requests.
 */
export declare class TokenBucketTracker {
    private readonly buckets;
    private readonly config;
    constructor(config?: Partial<TokenBucketConfig>);
    /**
     * Get current token balance for an account, applying regeneration.
     */
    getTokens(accountIndex: number): number;
    /**
     * Check if account has enough tokens for a request.
     * @param cost Cost of the request (default: 1)
     */
    hasTokens(accountIndex: number, cost?: number): boolean;
    /**
     * Consume tokens for a request.
     * @returns true if tokens were consumed, false if insufficient
     */
    consume(accountIndex: number, cost?: number): boolean;
    /**
     * Refund tokens (e.g., if request wasn't actually sent).
     */
    refund(accountIndex: number, amount?: number): void;
    getMaxTokens(): number;
}
export declare function getTokenTracker(): TokenBucketTracker;
export declare function initTokenTracker(config: Partial<TokenBucketConfig>): TokenBucketTracker;
/**
 * Get the global health score tracker instance.
 * Creates one with default config if not initialized.
 */
export declare function getHealthTracker(): HealthScoreTracker;
/**
 * Initialize the global health tracker with custom config.
 * Call this at plugin startup if custom config is needed.
 */
export declare function initHealthTracker(config: Partial<HealthScoreConfig>): HealthScoreTracker;
//# sourceMappingURL=rotation.d.ts.map