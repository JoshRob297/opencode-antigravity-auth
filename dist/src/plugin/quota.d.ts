import type { PluginClient } from "./types";
import type { AccountMetadataV3 } from "./storage";
export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash";
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
export declare function fetchQuotaSummary(accessToken: string, projectId?: string): Promise<CloudCodeQuotaSummaryResponse>;
export declare function fetchAvailableModels(accessToken: string, projectId?: string): Promise<FetchAvailableModelsResponse>;
export declare function fetchAccountQuotaDetails(account: AccountMetadataV3, index: number, client: PluginClient, providerId?: string): Promise<AccountQuotaResult>;
export declare function checkAccountsQuota(accounts: AccountMetadataV3[], client: PluginClient, providerId?: string): Promise<AccountQuotaResult[]>;
export declare function formatQuotaReportMarkdown(results: AccountQuotaResult[]): string;
//# sourceMappingURL=quota.d.ts.map