import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getOpencodeConfigDir } from "./config/updater";
import { createLogger } from "./logger";
import { shortEmail } from "./quota";
const log = createLogger("stats");
const STATS_FILE_NAME = "antigravity-stats.json";
export class EngineStatsManager {
    static instance;
    filePath;
    data;
    dirty = false;
    saveTimer;
    constructor() {
        const configDir = getOpencodeConfigDir();
        this.filePath = join(configDir, STATS_FILE_NAME);
        this.data = this.load();
    }
    static getInstance() {
        if (!EngineStatsManager.instance) {
            EngineStatsManager.instance = new EngineStatsManager();
        }
        return EngineStatsManager.instance;
    }
    defaultData() {
        return {
            version: 1,
            startedAt: Date.now(),
            lastUpdated: Date.now(),
            accounts: {},
            cache: {
                memoryHits: 0,
                diskHits: 0,
                misses: 0,
                writes: 0,
            },
        };
    }
    load() {
        try {
            if (existsSync(this.filePath)) {
                const content = readFileSync(this.filePath, "utf-8");
                const parsed = JSON.parse(content);
                if (parsed && typeof parsed === "object" && parsed.accounts) {
                    return {
                        ...this.defaultData(),
                        ...parsed,
                        cache: {
                            ...this.defaultData().cache,
                            ...(parsed.cache || {}),
                        },
                    };
                }
            }
        }
        catch (err) {
            log.warn(`Failed to load engine stats from ${this.filePath}: ${err}`);
        }
        return this.defaultData();
    }
    scheduleSave() {
        this.dirty = true;
        if (this.saveTimer)
            return;
        this.saveTimer = setTimeout(() => {
            this.saveNow();
        }, 1500);
    }
    saveNow() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        if (!this.dirty)
            return;
        try {
            this.data.lastUpdated = Date.now();
            const configDir = getOpencodeConfigDir();
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
            this.dirty = false;
        }
        catch (err) {
            log.warn(`Failed to save engine stats to ${this.filePath}: ${err}`);
        }
    }
    getOrCreateAccount(email) {
        if (!this.data.accounts[email]) {
            this.data.accounts[email] = {
                email,
                requestsTotal: 0,
                requestsSuccess: 0,
                rateLimits429: 0,
                errorsOther: 0,
            };
        }
        return this.data.accounts[email];
    }
    recordSuccess(email, healthScore) {
        const acc = this.getOrCreateAccount(email);
        acc.requestsTotal++;
        acc.requestsSuccess++;
        acc.lastSuccessTimestamp = Date.now();
        if (healthScore !== undefined) {
            acc.healthScore = healthScore;
        }
        this.scheduleSave();
    }
    recordRateLimit(email, healthScore) {
        const acc = this.getOrCreateAccount(email);
        acc.requestsTotal++;
        acc.rateLimits429++;
        acc.lastRateLimitTimestamp = Date.now();
        if (healthScore !== undefined) {
            acc.healthScore = healthScore;
        }
        this.scheduleSave();
    }
    recordError(email, healthScore) {
        const acc = this.getOrCreateAccount(email);
        acc.requestsTotal++;
        acc.errorsOther++;
        acc.lastErrorTimestamp = Date.now();
        if (healthScore !== undefined) {
            acc.healthScore = healthScore;
        }
        this.scheduleSave();
    }
    updateHealthScore(email, healthScore) {
        const acc = this.getOrCreateAccount(email);
        acc.healthScore = healthScore;
        this.scheduleSave();
    }
    getSavedHealthScore(email) {
        return this.data.accounts[email]?.healthScore;
    }
    updateCacheStats(cacheStats) {
        this.data.cache = { ...cacheStats };
        this.scheduleSave();
    }
    getData() {
        return this.data;
    }
    formatStatsReport(activeEmail) {
        const data = this.data;
        const lines = [];
        lines.push("==================== ANTIGRAVITY ENGINE STATS ====================");
        lines.push("");
        const accounts = Object.values(data.accounts);
        if (accounts.length === 0) {
            lines.push("Sin actividad registrada aun.");
        }
        else {
            lines.push("ACCOUNT".padEnd(26) +
                "HEALTH".padEnd(10) +
                "REQS (OK/429/ERR)".padEnd(20) +
                "STATUS");
            lines.push("-".repeat(66));
            for (const acc of accounts) {
                const userPart = shortEmail(acc.email).padEnd(24);
                const health = `${acc.healthScore ?? 100}%`.padEnd(10);
                const reqs = `${acc.requestsSuccess}/${acc.rateLimits429}/${acc.errorsOther}`.padEnd(20);
                const isActive = activeEmail && acc.email.toLowerCase() === activeEmail.toLowerCase();
                const status = isActive ? "ACTIVE" : "STANDBY";
                lines.push(`${userPart}  ${health}${reqs}${status}`);
            }
        }
        lines.push("");
        lines.push("SIGNATURE CACHE (THINKING)");
        const totalHits = (data.cache.memoryHits || 0) + (data.cache.diskHits || 0);
        const totalOps = totalHits + (data.cache.misses || 0);
        const hitRate = totalOps > 0 ? ((totalHits / totalOps) * 100).toFixed(1) : "100.0";
        lines.push(`Memory Hits: ${data.cache.memoryHits} | Disk Hits: ${data.cache.diskHits} | Misses: ${data.cache.misses} | Writes: ${data.cache.writes} (${hitRate}% Hit Rate)`);
        lines.push("==================================================================");
        return lines.join("\n");
    }
}
//# sourceMappingURL=stats.js.map