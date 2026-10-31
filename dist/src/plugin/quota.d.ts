import type { PluginClient } from "./types";
import type { AccountMetadataV3, AccountModelCatalog } from "./storage";
export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash" | "argon";
export interface QuotaGroupSummary {
    remainingFraction?: number;
    resetTime?: string;
    modelCount?: number;
}
export interface BucketQuotaDisplay {
    window: "5h" | "weekly" | string;
    displayName: string;
    remainingPercentage: number;
    remainingFraction: number;
    resetTime: Date;
    /** Absolute reset as the backend reported it, in UTC (`2026-11-07 01:37Z`). */
    resetTimeDisplay: string;
    timeUntilReset: number;
    timeUntilResetFormatted: string;
}
export interface GroupQuotaDisplay {
    displayName: string;
    description?: string;
    fiveHour?: BucketQuotaDisplay;
    weekly?: BucketQuotaDisplay;
}
export interface ModelQuotaDisplay {
    label: string;
    modelId: string;
    remainingPercentage: number;
    remainingFraction: number;
    isExhausted: boolean;
    resetTime: Date;
    resetTimeDisplay: string;
    timeUntilReset: number;
    timeUntilResetFormatted: string;
    recommended?: boolean;
    tagTitle?: string;
}
export type AccountQuotaStatus = "ok" | "disabled" | "error";
export interface AccountQuotaResult {
    index: number;
    email?: string;
    status: AccountQuotaStatus;
    error?: string;
    disabled?: boolean;
    groups?: GroupQuotaDisplay[];
    models?: ModelQuotaDisplay[];
    cachedQuota?: Partial<Record<QuotaGroup, QuotaGroupSummary>>;
    /** Measured per-account model catalog, used to report entitlements. */
    modelCatalog?: AccountModelCatalog;
    updatedAccount?: AccountMetadataV3;
}
export interface CloudCodeQuotaSummaryResponse {
    groups?: {
        displayName?: string;
        description?: string;
        buckets?: {
            bucketId?: string;
            displayName?: string;
            window?: string;
            resetTime?: string;
            description?: string;
            remainingFraction?: number;
        }[];
    }[];
    description?: string;
}
export interface FetchAvailableModelsResponse {
    models?: Record<string, {
        displayName?: string;
        model?: string;
        modelName?: string;
        quotaInfo?: {
            remainingFraction?: number;
            resetTime?: string;
        };
        supportsImages?: boolean;
        supportsVideo?: boolean;
        supportsThinking?: boolean;
        recommended?: boolean;
        tagTitle?: string;
    }>;
}
export declare function formatDuration(ms: number): string;
export declare function shortEmail(email: string): string;
export declare function progressBar(percent: number, width?: number): string;
/**
 * Absolute reset stamp in UTC as the backend reports it, e.g. `2026-11-07 01:37Z`.
 * The dual-window buckets are days apart, so "in 6d 23h" alone cannot be acted on.
 */
export declare function formatResetStamp(date: Date): string;
export declare function fetchQuotaSummary(accessToken: string, projectId?: string): Promise<CloudCodeQuotaSummaryResponse>;
export declare function fetchAvailableModels(accessToken: string, projectId?: string): Promise<FetchAvailableModelsResponse>;
export declare function fetchAccountQuotaDetails(account: AccountMetadataV3, index: number, client: PluginClient, providerId?: string): Promise<AccountQuotaResult>;
export declare function checkAccountsQuota(accounts: AccountMetadataV3[], client: PluginClient, providerId?: string): Promise<AccountQuotaResult[]>;
/**
 * Renders the quota report.
 *
 * Uses the per-account shape the backend actually returns now: one group per
 * model family (Gemini Flash/Pro, Claude/GPT and the standalone `Gemini 4 Argon`
 * bucket), each with its own 5h/weekly windows, plus the reset timestamps the
 * backend declares (absolute and relative) and the measured model catalog of
 * every account.
 */
export declare function formatQuotaReportMarkdown(results: AccountQuotaResult[]): string;
//# sourceMappingURL=quota.d.ts.map