import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { getOpencodeConfigDir } from "./config/updater";
import { createLogger } from "./logger";
import { shortEmail } from "./quota";

const log = createLogger("stats");

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

const STATS_FILE_NAME = "antigravity-stats.json";

export class EngineStatsManager {
  private static instance?: EngineStatsManager;
  private filePath: string;
  private data: EngineStatsData;
  private dirty = false;
  private saveTimer?: NodeJS.Timeout;
  private loadedMtimeMs = 0;

  private constructor() {
    const override = env.ANTIGRAVITY_STATS_PATH?.trim();
    this.filePath = override || join(getOpencodeConfigDir(), STATS_FILE_NAME);
    this.data = this.load();
  }

  public static getInstance(): EngineStatsManager {
    if (!EngineStatsManager.instance) {
      EngineStatsManager.instance = new EngineStatsManager();
    }
    return EngineStatsManager.instance;
  }

  private defaultData(): EngineStatsData {
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

  private load(): EngineStatsData {
    this.loadedMtimeMs = 0;
    try {
      if (existsSync(this.filePath)) {
        this.loadedMtimeMs = statSync(this.filePath).mtimeMs;
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
    } catch (err) {
      log.warn(`Failed to load engine stats from ${this.filePath}: ${err}`);
    }
    return this.defaultData();
  }

  /**
   * Picks up counters written by another process (a `opencode run --standalone`
   * session, the CLI wrapper) so a long-lived server does not keep reporting the
   * snapshot it loaded at startup.
   */
  private refreshFromDisk(): void {
    // Unsaved local increments win over the file: reloading here would drop them.
    if (this.dirty) {
      return;
    }
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      const mtimeMs = statSync(this.filePath).mtimeMs;
      if (mtimeMs <= this.loadedMtimeMs) {
        return;
      }
      this.data = this.load();
    } catch {
      // A missing or unreadable file keeps the in-memory snapshot.
    }
  }

  /**
   * Writes immediately. The previous 1.5 s debounce lost the counters of short
   * lived processes (`opencode run` exits before the timer fires), which is why
   * one-shot sessions never appeared in the report.
   */
  private scheduleSave(): void {
    this.dirty = true;
    this.saveNow();
  }

  public saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (!this.dirty) return;
    try {
      this.data.lastUpdated = Date.now();
      const configDir = getOpencodeConfigDir();
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      log.warn(`Failed to save engine stats to ${this.filePath}: ${err}`);
    }
  }

  private getOrCreateAccount(email: string): AccountStatsData {
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

  public recordSuccess(email: string, healthScore?: number): void {
    const acc = this.getOrCreateAccount(email);
    acc.requestsTotal++;
    acc.requestsSuccess++;
    acc.lastSuccessTimestamp = Date.now();
    if (healthScore !== undefined) {
      acc.healthScore = healthScore;
    }
    this.scheduleSave();
  }

  public recordRateLimit(email: string, healthScore?: number): void {
    const acc = this.getOrCreateAccount(email);
    acc.requestsTotal++;
    acc.rateLimits429++;
    acc.lastRateLimitTimestamp = Date.now();
    if (healthScore !== undefined) {
      acc.healthScore = healthScore;
    }
    this.scheduleSave();
  }

  public recordError(email: string, healthScore?: number): void {
    const acc = this.getOrCreateAccount(email);
    acc.requestsTotal++;
    acc.errorsOther++;
    acc.lastErrorTimestamp = Date.now();
    if (healthScore !== undefined) {
      acc.healthScore = healthScore;
    }
    this.scheduleSave();
  }

  public updateHealthScore(email: string, healthScore: number): void {
    const acc = this.getOrCreateAccount(email);
    acc.healthScore = healthScore;
    this.scheduleSave();
  }

  public getSavedHealthScore(email: string): number | undefined {
    return this.data.accounts[email]?.healthScore;
  }

  public updateCacheStats(cacheStats: { memoryHits: number; diskHits: number; misses: number; writes: number }): void {
    this.data.cache = { ...cacheStats };
    this.scheduleSave();
  }

  public getData(): EngineStatsData {
    this.refreshFromDisk();
    return this.data;
  }

  public formatStatsReport(activeEmail?: string): string {
    this.refreshFromDisk();
    const data = this.data;
    const lines: string[] = [];

    lines.push("==================== ANTIGRAVITY ENGINE STATS ====================");
    lines.push("");

    const accounts = Object.values(data.accounts);
    if (accounts.length === 0) {
      lines.push("Sin actividad registrada aun.");
    } else {
      lines.push(
        "ACCOUNT".padEnd(26) +
        "HEALTH".padEnd(10) +
        "REQS (OK/429/ERR)".padEnd(20) +
        "STATUS"
      );
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

    lines.push(
      `Memory Hits: ${data.cache.memoryHits} | Disk Hits: ${data.cache.diskHits} | Misses: ${data.cache.misses} | Writes: ${data.cache.writes} (${hitRate}% Hit Rate)`
    );
    lines.push("==================================================================");

    return lines.join("\n");
  }
}
