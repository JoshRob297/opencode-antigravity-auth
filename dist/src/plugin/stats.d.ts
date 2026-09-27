export interface AccountStatsData {
    email: string;
    requestsTotal: number;
    requestsSuccess: number;
    rateLimits429: number;
    errorsOther: number;
    lastSuccessTimestamp?: number;
    lastRateLimitTimestamp?: number;
    lastErrorTimestamp?: number;
    healthScore?: number;
}
export interface CacheStatsData {
    memoryHits: number;
    diskHits: number;
    misses: number;
    writes: number;
}
export interface EngineStatsData {
    version: number;
    startedAt: number;
    lastUpdated: number;
    accounts: Record<string, AccountStatsData>;
    cache: CacheStatsData;
}
export declare class EngineStatsManager {
    private static instance?;
    private filePath;
    private data;
    private dirty;
    private saveTimer?;
    private constructor();
    static getInstance(): EngineStatsManager;
    private defaultData;
    private load;
    private scheduleSave;
    saveNow(): void;
    private getOrCreateAccount;
    recordSuccess(email: string, healthScore?: number): void;
    recordRateLimit(email: string, healthScore?: number): void;
    recordError(email: string, healthScore?: number): void;
    updateHealthScore(email: string, healthScore: number): void;
    getSavedHealthScore(email: string): number | undefined;
    updateCacheStats(cacheStats: {
        memoryHits: number;
        diskHits: number;
        misses: number;
        writes: number;
    }): void;
    getData(): EngineStatsData;
    formatStatsReport(activeEmail?: string): string;
}
//# sourceMappingURL=stats.d.ts.map