/**
 * Per-request token ledger plus quota snapshots.
 *
 * The backend never publishes a token allowance per bucket, so the only way to
 * know what an account actually offers is to measure it: pair the tokens a
 * request consumed with the quota percentage it moved. This module records both
 * sides and derives tokens-per-percentage-point from consecutive snapshots.
 */
export type UsageGroup = "gemini" | "claude" | "argon";
export interface UsageEntry {
    ts: number;
    account: string;
    model: string;
    group: UsageGroup;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    session?: string;
}
export interface QuotaSnapshot {
    ts: number;
    account: string;
    /** Keyed by `<group>:<window>`, percentages in 0..100. */
    buckets: Record<string, {
        remainingPercentage: number;
        reset?: string;
    }>;
}
export declare function usageFilePath(): string;
export declare function quotaHistoryFilePath(): string;
export declare function groupForModel(model: string): UsageGroup;
/** Maps a quota group display name to the ledger family. */
export declare function groupForQuotaLabel(label: string): UsageGroup;
export interface UsageNumbers {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
}
/**
 * Normalizes the `usageMetadata` block the model returns. Returns null when the
 * block carries no counts, so a keepalive chunk does not create a zero row.
 */
export declare function buildUsageEntry(usage: UsageNumbers | undefined, meta: {
    account?: string;
    model?: string;
    session?: string;
    ts?: number;
}): UsageEntry | null;
export declare function recordUsage(entry: UsageEntry | null): void;
export declare function recordQuotaSnapshot(snapshot: QuotaSnapshot): void;
export declare function readUsage(sinceMs?: number): UsageEntry[];
export declare function readQuotaSnapshots(sinceMs?: number): QuotaSnapshot[];
export interface UsageBreakdown {
    requests: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    total: number;
}
export interface UsageSummary {
    overall: UsageBreakdown;
    byAccount: Record<string, UsageBreakdown>;
    byModel: Record<string, UsageBreakdown>;
    byDay: Record<string, UsageBreakdown>;
}
export declare function aggregateUsage(entries: UsageEntry[]): UsageSummary;
export interface CapacityEstimate {
    account: string;
    bucket: string;
    tokens: number;
    requests: number;
    dropPercentagePoints: number;
    tokensPerPoint: number;
    requestsPerPoint: number;
    estimatedFullBucketTokens: number;
    samples: number;
    /** Windows with a measured drop vs total comparable windows (same reset). */
    windowsMoved: number;
    windowsObserved: number;
    /**
     * "request" when the charge tracks calls rather than tokens: measured on Argon,
     * two calls of 32k and two calls of ~5k both moved the bucket ~1%, so a
     * token-proportional estimate would be off by an order of magnitude.
     */
    basis: "token" | "request" | "mixed";
}
/**
 * Derives how many tokens one bucket percentage point is worth, by pairing each
 * decrease between two snapshots with the tokens the ledger recorded for that
 * account and family in between. Snapshots whose reset time changed are skipped:
 * a reset resets the counter too.
 */
export declare function estimateCapacity(usage: UsageEntry[], snapshots: QuotaSnapshot[]): CapacityEstimate[];
export declare function formatTokens(value: number): string;
export interface UsageReportOptions {
    windowLabel: string;
    byAccount?: boolean;
    capacity?: CapacityEstimate[];
}
export declare function formatUsageReport(summary: UsageSummary, options: UsageReportOptions): string;
//# sourceMappingURL=usage-ledger.d.ts.map