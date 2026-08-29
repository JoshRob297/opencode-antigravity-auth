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
export const DEFAULT_HEALTH_SCORE_CONFIG = {
    initial: 70,
    successReward: 1,
    rateLimitPenalty: -10,
    failurePenalty: -20,
    recoveryRatePerHour: 2,
    minUsable: 50,
    maxScore: 100,
};
/**
 * Tracks health scores for accounts.
 * Higher score = healthier account = preferred for selection.
 */
export class HealthScoreTracker {
    scores = new Map();
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_HEALTH_SCORE_CONFIG, ...config };
    }
    /**
     * Get current health score for an account, applying time-based recovery.
     */
    getScore(accountIndex) {
        const state = this.scores.get(accountIndex);
        if (!state) {
            return this.config.initial;
        }
        // Apply passive recovery based on time since last update
        const now = Date.now();
        const hoursSinceUpdate = (now - state.lastUpdated) / (1000 * 60 * 60);
        const recoveredPoints = Math.floor(hoursSinceUpdate * this.config.recoveryRatePerHour);
        return Math.min(this.config.maxScore, state.score + recoveredPoints);
    }
    /**
     * Record a successful request - improves health score.
     */
    recordSuccess(accountIndex) {
        const now = Date.now();
        const current = this.getScore(accountIndex);
        this.scores.set(accountIndex, {
            score: Math.min(this.config.maxScore, current + this.config.successReward),
            lastUpdated: now,
            lastSuccess: now,
            consecutiveFailures: 0,
        });
    }
    /**
     * Record a rate limit hit - moderate penalty.
     */
    recordRateLimit(accountIndex) {
        const now = Date.now();
        const state = this.scores.get(accountIndex);
        const current = this.getScore(accountIndex);
        this.scores.set(accountIndex, {
            score: Math.max(0, current + this.config.rateLimitPenalty),
            lastUpdated: now,
            lastSuccess: state?.lastSuccess ?? 0,
            consecutiveFailures: (state?.consecutiveFailures ?? 0) + 1,
        });
    }
    /**
     * Record a failure (auth, network, etc.) - larger penalty.
     */
    recordFailure(accountIndex) {
        const now = Date.now();
        const state = this.scores.get(accountIndex);
        const current = this.getScore(accountIndex);
        this.scores.set(accountIndex, {
            score: Math.max(0, current + this.config.failurePenalty),
            lastUpdated: now,
            lastSuccess: state?.lastSuccess ?? 0,
            consecutiveFailures: (state?.consecutiveFailures ?? 0) + 1,
        });
    }
    /**
     * Check if account is healthy enough to use.
     */
    isUsable(accountIndex) {
        return this.getScore(accountIndex) >= this.config.minUsable;
    }
    /**
     * Get consecutive failure count for an account.
     */
    getConsecutiveFailures(accountIndex) {
        return this.scores.get(accountIndex)?.consecutiveFailures ?? 0;
    }
    /**
     * Reset health state for an account (e.g., after removal).
     */
    reset(accountIndex) {
        this.scores.delete(accountIndex);
    }
    /**
     * Get all scores for debugging/logging.
     */
    getSnapshot() {
        const result = new Map();
        for (const [index] of this.scores) {
            result.set(index, {
                score: this.getScore(index),
                consecutiveFailures: this.getConsecutiveFailures(index),
            });
        }
        return result;
    }
}
// ============================================================================
// JITTER UTILITIES
// ============================================================================
/**
 * Add random jitter to a delay value.
 * Helps break predictable timing patterns.
 *
 * @param baseMs - Base delay in milliseconds
 * @param jitterFactor - Fraction of base to vary (default: 0.3 = ±30%)
 * @returns Jittered delay in milliseconds
 */
export function addJitter(baseMs, jitterFactor = 0.3) {
    const jitterRange = baseMs * jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange; // -jitterRange to +jitterRange
    return Math.max(0, Math.round(baseMs + jitter));
}
/**
 * Generate a random delay within a range.
 *
 * @param minMs - Minimum delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 * @returns Random delay between min and max
 */
export function randomDelay(minMs, maxMs) {
    return Math.round(minMs + Math.random() * (maxMs - minMs));
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
export function sortByLruWithHealth(accounts, minHealthScore = 50) {
    return accounts
        .filter(acc => !acc.isRateLimited && !acc.isCoolingDown && acc.healthScore >= minHealthScore)
        .sort((a, b) => {
        // Primary: LRU (oldest lastUsed first)
        const lruDiff = a.lastUsed - b.lastUsed;
        if (lruDiff !== 0)
            return lruDiff;
        // Tiebreaker: higher health score wins
        return b.healthScore - a.healthScore;
    });
}
/** Stickiness bonus added to current account's score to prevent unnecessary switching */
const STICKINESS_BONUS = 150;
/** Minimum score advantage required to switch away from current account */
const SWITCH_THRESHOLD = 100;
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
export function selectHybridAccount(accounts, tokenTracker, currentAccountIndex = null, minHealthScore = 50) {
    const candidates = accounts
        .filter(acc => !acc.isRateLimited &&
        !acc.isCoolingDown &&
        acc.healthScore >= minHealthScore &&
        tokenTracker.hasTokens(acc.index))
        .map(acc => ({
        ...acc,
        tokens: tokenTracker.getTokens(acc.index)
    }));
    if (candidates.length === 0) {
        return null;
    }
    const maxTokens = tokenTracker.getMaxTokens();
    const scored = candidates
        .map(acc => {
        const baseScore = calculateHybridScore(acc, maxTokens);
        // Apply stickiness bonus to current account
        const stickinessBonus = acc.index === currentAccountIndex ? STICKINESS_BONUS : 0;
        return {
            index: acc.index,
            baseScore,
            score: baseScore + stickinessBonus,
            isCurrent: acc.index === currentAccountIndex
        };
    })
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) {
        return null;
    }
    // If current account is still a candidate, check if switch is warranted
    const currentCandidate = scored.find(s => s.isCurrent);
    if (currentCandidate && !best.isCurrent) {
        // Only switch if best beats current's BASE score by threshold
        // (compare base scores to avoid circular stickiness bonus comparison)
        const advantage = best.baseScore - currentCandidate.baseScore;
        if (advantage < SWITCH_THRESHOLD) {
            return currentCandidate.index;
        }
    }
    return best.index;
}
function calculateHybridScore(account, maxTokens) {
    const healthComponent = account.healthScore * 2; // 0-200
    const tokenComponent = (account.tokens / maxTokens) * 100 * 5; // 0-500
    const secondsSinceUsed = (Date.now() - account.lastUsed) / 1000;
    const freshnessComponent = Math.min(secondsSinceUsed, 3600) * 0.1; // 0-360
    return Math.max(0, healthComponent + tokenComponent + freshnessComponent);
}
export const DEFAULT_TOKEN_BUCKET_CONFIG = {
    maxTokens: 50,
    regenerationRatePerMinute: 6,
    initialTokens: 50,
};
/**
 * Client-side rate limiting using Token Bucket algorithm.
 * Helps prevent hitting server 429s by tracking "cost" of requests.
 */
export class TokenBucketTracker {
    buckets = new Map();
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_TOKEN_BUCKET_CONFIG, ...config };
    }
    /**
     * Get current token balance for an account, applying regeneration.
     */
    getTokens(accountIndex) {
        const state = this.buckets.get(accountIndex);
        if (!state) {
            return this.config.initialTokens;
        }
        const now = Date.now();
        const minutesSinceUpdate = (now - state.lastUpdated) / (1000 * 60);
        const recoveredTokens = minutesSinceUpdate * this.config.regenerationRatePerMinute;
        return Math.min(this.config.maxTokens, state.tokens + recoveredTokens);
    }
    /**
     * Check if account has enough tokens for a request.
     * @param cost Cost of the request (default: 1)
     */
    hasTokens(accountIndex, cost = 1) {
        return this.getTokens(accountIndex) >= cost;
    }
    /**
     * Consume tokens for a request.
     * @returns true if tokens were consumed, false if insufficient
     */
    consume(accountIndex, cost = 1) {
        const current = this.getTokens(accountIndex);
        if (current < cost) {
            return false;
        }
        this.buckets.set(accountIndex, {
            tokens: current - cost,
            lastUpdated: Date.now(),
        });
        return true;
    }
    /**
     * Refund tokens (e.g., if request wasn't actually sent).
     */
    refund(accountIndex, amount = 1) {
        const current = this.getTokens(accountIndex);
        this.buckets.set(accountIndex, {
            tokens: Math.min(this.config.maxTokens, current + amount),
            lastUpdated: Date.now(),
        });
    }
    getMaxTokens() {
        return this.config.maxTokens;
    }
}
// ============================================================================
// SINGLETON TRACKERS
// ============================================================================
let globalTokenTracker = null;
export function getTokenTracker() {
    if (!globalTokenTracker) {
        globalTokenTracker = new TokenBucketTracker();
    }
    return globalTokenTracker;
}
export function initTokenTracker(config) {
    globalTokenTracker = new TokenBucketTracker(config);
    return globalTokenTracker;
}
let globalHealthTracker = null;
/**
 * Get the global health score tracker instance.
 * Creates one with default config if not initialized.
 */
export function getHealthTracker() {
    if (!globalHealthTracker) {
        globalHealthTracker = new HealthScoreTracker();
    }
    return globalHealthTracker;
}
/**
 * Initialize the global health tracker with custom config.
 * Call this at plugin startup if custom config is needed.
 */
export function initHealthTracker(config) {
    globalHealthTracker = new HealthScoreTracker(config);
    return globalHealthTracker;
}
//# sourceMappingURL=rotation.js.map