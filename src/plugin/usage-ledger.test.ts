import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateUsage,
  buildUsageEntry,
  estimateCapacity,
  formatUsageReport,
  groupForModel,
  groupForQuotaLabel,
  readQuotaSnapshots,
  readUsage,
  recordQuotaSnapshot,
  recordUsage,
  type QuotaSnapshot,
  type UsageEntry,
} from "./usage-ledger";

describe("usage ledger", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "antigravity-ledger-"));
    process.env.ANTIGRAVITY_LEDGER_DIR = dir;
  });

  afterEach(() => {
    delete process.env.ANTIGRAVITY_LEDGER_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("classifies models into quota families", () => {
    expect(groupForModel("gemini-4-argon-high")).toBe("argon");
    expect(groupForModel("gemini-3.8-flash-high")).toBe("gemini");
    expect(groupForModel("claude-sonnet-5-5-medium")).toBe("claude");
    expect(groupForModel("gpt-oss-120b-medium")).toBe("claude");
    expect(groupForQuotaLabel("Gemini 4 Argon")).toBe("argon");
    expect(groupForQuotaLabel("Claude and GPT models")).toBe("claude");
    expect(groupForQuotaLabel("Gemini Models")).toBe("gemini");
  });

  it("normalizes usageMetadata and drops empty blocks", () => {
    expect(buildUsageEntry(undefined, {})).toBeNull();
    expect(buildUsageEntry({}, {})).toBeNull();
    expect(buildUsageEntry({ promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 }, {})).toBeNull();

    const entry = buildUsageEntry(
      { promptTokenCount: 2000, candidatesTokenCount: 300, thoughtsTokenCount: 50, cachedContentTokenCount: 1200, totalTokenCount: 2350 },
      { account: "a@example.com", model: "gemini-4-argon-high", session: "ses_1", ts: 1000 },
    );
    expect(entry).toMatchObject({
      account: "a@example.com",
      model: "gemini-4-argon-high",
      group: "argon",
      input: 2000,
      output: 300,
      reasoning: 50,
      cacheRead: 1200,
      total: 2350,
      session: "ses_1",
      ts: 1000,
    });
  });

  it("appends and reads both ledgers, skipping a truncated line", () => {
    recordUsage(buildUsageEntry({ promptTokenCount: 10, totalTokenCount: 10 }, { account: "a@x", model: "gemini-3.8-flash-high", ts: 5 }));
    recordUsage(buildUsageEntry({ promptTokenCount: 20, totalTokenCount: 20 }, { account: "b@x", model: "claude-sonnet-5-5-medium", ts: 10 }));
    recordQuotaSnapshot({ ts: 5, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 98.5, reset: "2026-11-07" } } });

    expect(readUsage()).toHaveLength(2);
    expect(readUsage(6)).toHaveLength(1);
    expect(readQuotaSnapshots()).toHaveLength(1);
  });

  it("aggregates per account, model and day", () => {
    const entries: UsageEntry[] = [
      { ts: Date.UTC(2026, 9, 30), account: "a@x", model: "gemini-4-argon-high", group: "argon", input: 100, output: 10, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 110 },
      { ts: Date.UTC(2026, 9, 30), account: "a@x", model: "gemini-4-argon-high", group: "argon", input: 200, output: 20, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 220 },
      { ts: Date.UTC(2026, 9, 31), account: "b@x", model: "gemini-3.8-flash-high", group: "gemini", input: 50, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 55 },
    ];

    const summary = aggregateUsage(entries);
    expect(summary.overall.requests).toBe(3);
    expect(summary.overall.total).toBe(385);
    expect(summary.byAccount["a@x"]!.total).toBe(330);
    expect(summary.byModel["gemini-4-argon-high"]!.requests).toBe(2);
    expect(summary.byDay["2026-10-30"]!.total).toBe(330);
  });

  it("derives capacity from a quota drop and the tokens in between", () => {
    const usage: UsageEntry[] = [
      { ts: 1000, account: "a@x", model: "gemini-4-argon-high", group: "argon", input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 65_000 },
    ];
    const snapshots: QuotaSnapshot[] = [
      { ts: 500, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 99.0, reset: "2026-11-07" } } },
      { ts: 1500, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 98.0, reset: "2026-11-07" } } },
    ];

    const [estimate] = estimateCapacity(usage, snapshots);
    expect(estimate).toMatchObject({
      account: "a@x",
      bucket: "argon:weekly",
      tokensPerPoint: 65_000,
      requestsPerPoint: 1,
      estimatedFullBucketTokens: 6_500_000,
      samples: 1,
      windowsMoved: 1,
      windowsObserved: 1,
      basis: "mixed",
    });
  });

  it("ignores a window whose reset changed or that had no traffic", () => {
    const usage: UsageEntry[] = [
      { ts: 1200, account: "a@x", model: "gemini-4-argon-high", group: "argon", input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 10_000 },
    ];
    const resetEdges: QuotaSnapshot[] = [
      { ts: 1000, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 99, reset: "2026-11-07" } } },
      { ts: 2000, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 97, reset: "2026-11-14" } } },
    ];
    expect(estimateCapacity(usage, resetEdges)).toHaveLength(0);

    const noTraffic: QuotaSnapshot[] = [
      { ts: 1000, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 99, reset: "2026-11-07" } } },
      { ts: 2000, account: "a@x", buckets: { "argon:weekly": { remainingPercentage: 98, reset: "2026-11-07" } } },
    ];
    expect(estimateCapacity([], noTraffic)).toHaveLength(0);
  });

  it("renders a report with the capacity table and the not-measurable notice", () => {
    const entries: UsageEntry[] = [
      { ts: Date.now(), account: "a@x", model: "gemini-4-argon-high", group: "argon", input: 1000, output: 100, reasoning: 0, cacheRead: 5000, cacheWrite: 0, total: 6100 },
    ];
    const summary = aggregateUsage(entries);

    const withoutCapacity = formatUsageReport(summary, { windowLabel: "last 7 days", capacity: [] });
    expect(withoutCapacity).toContain("BUCKET CAPACITY: not measurable yet");
    expect(withoutCapacity).toContain("BY ACCOUNT");

    const withCapacity = formatUsageReport(summary, {
      windowLabel: "last 7 days",
      capacity: [{ account: "a@x", bucket: "argon:weekly", tokens: 65_000, requests: 2, dropPercentagePoints: 1, tokensPerPoint: 65_000, requestsPerPoint: 2, estimatedFullBucketTokens: 6_500_000, samples: 1, windowsMoved: 1, windowsObserved: 1, basis: "request" }],
    });
    expect(withCapacity).toContain("BUCKET CAPACITY (measured");
    expect(withCapacity).toContain("6.50M");
    expect(withCapacity).toContain("BASIS=request");
  });
});
