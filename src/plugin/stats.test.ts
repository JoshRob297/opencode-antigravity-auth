import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("EngineStatsManager", () => {
  let dir: string;
  let statsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "antigravity-stats-"));
    statsPath = join(dir, "antigravity-stats.json");
    process.env.ANTIGRAVITY_STATS_PATH = statsPath;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ANTIGRAVITY_STATS_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts successes, rate limits and errors per account and persists them", async () => {
    const { EngineStatsManager } = await import("./stats");
    const stats = EngineStatsManager.getInstance();

    stats.recordSuccess("a@example.com");
    stats.recordSuccess("a@example.com");
    stats.recordRateLimit("a@example.com");
    stats.recordError("a@example.com");
    stats.recordSuccess("b@example.com");
    stats.saveNow();

    const written = JSON.parse(readFileSync(statsPath, "utf8"));
    expect(written.accounts["a@example.com"].requestsTotal).toBe(4);
    expect(written.accounts["a@example.com"].requestsSuccess).toBe(2);
    expect(written.accounts["a@example.com"].rateLimits429).toBe(1);
    expect(written.accounts["a@example.com"].errorsOther).toBe(1);
    expect(written.accounts["b@example.com"].requestsSuccess).toBe(1);
  });

  it("renders the report from the counters instead of the empty banner", async () => {
    const { EngineStatsManager } = await import("./stats");
    const stats = EngineStatsManager.getInstance();

    expect(stats.formatStatsReport()).toContain("Sin actividad registrada aun");

    stats.recordSuccess("joshuaadair.hr@gmail.com");
    stats.recordRateLimit("joshuaadair.hr@gmail.com");

    const report = stats.formatStatsReport("joshuaadair.hr@gmail.com");
    expect(report).not.toContain("Sin actividad registrada aun");
    expect(report).toContain("1/1/0");
    expect(report).toContain("ACTIVE");
  });

  it("picks up counters written by another process", async () => {
    const { EngineStatsManager } = await import("./stats");
    const stats = EngineStatsManager.getInstance();
    expect(stats.formatStatsReport()).toContain("Sin actividad registrada aun");

    writeFileSync(
      statsPath,
      JSON.stringify({
        version: 1,
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        accounts: {
          "external@example.com": {
            email: "external@example.com",
            requestsTotal: 3,
            requestsSuccess: 3,
            rateLimits429: 0,
            errorsOther: 0,
          },
        },
        cache: { memoryHits: 1, diskHits: 0, misses: 1, writes: 0 },
      }),
      "utf8",
    );

    const report = stats.formatStatsReport();
    expect(report).toContain("3/0/0");
    expect(report).toContain("Memory Hits: 1");
  });

  it("persists each event without waiting for a debounce", async () => {
    // One-shot sessions (`opencode run`) exit before a timer would fire, so the
    // counters have to be on disk when the record call returns.
    const { EngineStatsManager } = await import("./stats");
    const stats = EngineStatsManager.getInstance();

    stats.recordSuccess("immediate@example.com");

    const written = JSON.parse(readFileSync(statsPath, "utf8"));
    expect(written.accounts["immediate@example.com"].requestsSuccess).toBe(1);
  });
});
