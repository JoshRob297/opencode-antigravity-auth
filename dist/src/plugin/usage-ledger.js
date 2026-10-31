import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { getOpencodeConfigDir } from "./config/updater";
const USAGE_FILE = "antigravity-usage.jsonl";
const QUOTA_FILE = "antigravity-quota-history.jsonl";
function ledgerDir() {
    const override = env.ANTIGRAVITY_LEDGER_DIR?.trim();
    return override || getOpencodeConfigDir();
}
export function usageFilePath() {
    return join(ledgerDir(), USAGE_FILE);
}
export function quotaHistoryFilePath() {
    return join(ledgerDir(), QUOTA_FILE);
}
export function groupForModel(model) {
    const lower = model.toLowerCase();
    if (lower.includes("argon"))
        return "argon";
    if (lower.includes("claude") || lower.includes("gpt"))
        return "claude";
    return "gemini";
}
/** Maps a quota group display name to the ledger family. */
export function groupForQuotaLabel(label) {
    const lower = label.toLowerCase();
    if (lower.includes("argon"))
        return "argon";
    if (lower.includes("claude") || lower.includes("gpt"))
        return "claude";
    return "gemini";
}
/**
 * Normalizes the `usageMetadata` block the model returns. Returns null when the
 * block carries no counts, so a keepalive chunk does not create a zero row.
 */
export function buildUsageEntry(usage, meta) {
    if (!usage)
        return null;
    const input = usage.promptTokenCount ?? 0;
    const output = usage.candidatesTokenCount ?? 0;
    const reasoning = usage.thoughtsTokenCount ?? 0;
    const cacheRead = usage.cachedContentTokenCount ?? 0;
    const total = usage.totalTokenCount ?? input + output + reasoning;
    if (input === 0 && output === 0 && reasoning === 0 && total === 0) {
        return null;
    }
    return {
        ts: meta.ts ?? Date.now(),
        account: meta.account ?? "unknown",
        model: meta.model ?? "unknown",
        group: groupForModel(meta.model ?? ""),
        input,
        output,
        reasoning,
        cacheRead,
        cacheWrite: 0,
        total,
        session: meta.session,
    };
}
export function recordUsage(entry) {
    if (!entry)
        return;
    try {
        appendFileSync(usageFilePath(), `${JSON.stringify(entry)}\n`, "utf8");
    }
    catch {
        // A full or read-only disk must never break a model request.
    }
}
export function recordQuotaSnapshot(snapshot) {
    try {
        appendFileSync(quotaHistoryFilePath(), `${JSON.stringify(snapshot)}\n`, "utf8");
    }
    catch {
        // Same reasoning as recordUsage: telemetry never breaks the request.
    }
}
function readJsonLines(path) {
    if (!existsSync(path))
        return [];
    const out = [];
    for (const line of readFileSync(path, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            out.push(JSON.parse(trimmed));
        }
        catch {
            // A truncated last line (process killed mid-write) is skipped.
        }
    }
    return out;
}
export function readUsage(sinceMs = 0) {
    return readJsonLines(usageFilePath()).filter((entry) => (entry.ts ?? 0) >= sinceMs);
}
export function readQuotaSnapshots(sinceMs = 0) {
    return readJsonLines(quotaHistoryFilePath()).filter((entry) => (entry.ts ?? 0) >= sinceMs);
}
function emptyBreakdown() {
    return { requests: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, total: 0 };
}
function addTo(target, entry) {
    target.requests += 1;
    target.input += entry.input || 0;
    target.output += entry.output || 0;
    target.reasoning += entry.reasoning || 0;
    target.cacheRead += entry.cacheRead || 0;
    target.total += entry.total || 0;
}
export function aggregateUsage(entries) {
    const summary = {
        overall: emptyBreakdown(),
        byAccount: {},
        byModel: {},
        byDay: {},
    };
    for (const entry of entries) {
        addTo(summary.overall, entry);
        const account = entry.account || "unknown";
        summary.byAccount[account] ??= emptyBreakdown();
        addTo(summary.byAccount[account], entry);
        const model = entry.model || "unknown";
        summary.byModel[model] ??= emptyBreakdown();
        addTo(summary.byModel[model], entry);
        const day = new Date(entry.ts).toISOString().slice(0, 10);
        summary.byDay[day] ??= emptyBreakdown();
        addTo(summary.byDay[day], entry);
    }
    return summary;
}
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
/**
 * Derives how many tokens one bucket percentage point is worth, by pairing each
 * decrease between two snapshots with the tokens the ledger recorded for that
 * account and family in between. Snapshots whose reset time changed are skipped:
 * a reset resets the counter too.
 */
export function estimateCapacity(usage, snapshots) {
    const byAccountBucket = new Map();
    for (const snapshot of snapshots) {
        for (const [bucket, value] of Object.entries(snapshot.buckets ?? {})) {
            const key = `${snapshot.account}|${bucket}`;
            const list = byAccountBucket.get(key) ?? [];
            list.push({ ...snapshot, buckets: { [bucket]: value } });
            byAccountBucket.set(key, list);
        }
    }
    const estimates = [];
    for (const [key, list] of byAccountBucket) {
        const [account, bucket] = key.split("|");
        list.sort((a, b) => a.ts - b.ts);
        const tokenRatios = [];
        const requestRatios = [];
        let tokens = 0;
        let requests = 0;
        let windowsObserved = 0;
        let windowsMoved = 0;
        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const current = list[i];
            const prevBucket = prev.buckets[bucket];
            const currentBucket = current.buckets[bucket];
            if (prevBucket.reset !== currentBucket.reset)
                continue;
            const windowEntries = usage.filter((entry) => entry.account === account &&
                entry.group === groupForQuotaLabel(bucket) &&
                entry.ts > prev.ts &&
                entry.ts <= current.ts);
            windowsObserved += 1;
            const drop = prevBucket.remainingPercentage - currentBucket.remainingPercentage;
            if (drop <= 0)
                continue;
            if (windowEntries.length === 0)
                continue;
            windowsMoved += 1;
            const windowTokens = windowEntries.reduce((sum, entry) => sum + (entry.total || 0), 0);
            if (windowTokens <= 0)
                continue;
            tokenRatios.push(windowTokens / drop);
            requestRatios.push(windowEntries.length / drop);
            tokens += windowTokens;
            requests += windowEntries.length;
        }
        if (tokenRatios.length === 0)
            continue;
        const tokensPerPoint = median(tokenRatios);
        const requestsPerPoint = median(requestRatios);
        const tokenSpread = Math.max(...tokenRatios) / Math.max(Math.min(...tokenRatios), 1);
        const requestSpread = Math.max(...requestRatios) / Math.max(Math.min(...requestRatios), 1);
        const basis = tokenRatios.length < 2
            ? "mixed"
            : requestSpread * 1.2 < tokenSpread
                ? "request"
                : tokenSpread * 1.2 < requestSpread
                    ? "token"
                    : "mixed";
        estimates.push({
            account,
            bucket,
            tokens,
            requests,
            dropPercentagePoints: tokensPerPoint > 0 ? tokens / tokensPerPoint : 0,
            tokensPerPoint,
            requestsPerPoint,
            estimatedFullBucketTokens: tokensPerPoint * 100,
            samples: tokenRatios.length,
            windowsMoved,
            windowsObserved,
            basis,
        });
    }
    return estimates.sort((a, b) => a.account.localeCompare(b.account) || a.bucket.localeCompare(b.bucket));
}
export function formatTokens(value) {
    if (!Number.isFinite(value))
        return "n/a";
    if (value >= 1_000_000_000)
        return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000)
        return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000)
        return `${(value / 1_000).toFixed(1)}k`;
    return String(Math.round(value));
}
export function formatUsageReport(summary, options) {
    const lines = [];
    const overall = summary.overall;
    lines.push(`ANTIGRAVITY TOKEN USAGE (${options.windowLabel})`);
    lines.push("");
    lines.push(`Requests: ${overall.requests} | input ${formatTokens(overall.input)} | output ${formatTokens(overall.output)}` +
        ` | cache read ${formatTokens(overall.cacheRead)} | total ${formatTokens(overall.total)}`);
    const accounts = Object.entries(summary.byAccount);
    if (accounts.length > 0) {
        lines.push("");
        lines.push("BY ACCOUNT");
        lines.push(`${"ACCOUNT".padEnd(30)} ${"REQ".padStart(6)} ${"INPUT".padStart(10)} ${"OUTPUT".padStart(10)} ${"CACHE READ".padStart(12)} ${"TOTAL".padStart(10)}`);
        for (const [account, data] of accounts.sort((a, b) => b[1].total - a[1].total)) {
            lines.push(`${account.padEnd(30)} ${String(data.requests).padStart(6)} ${formatTokens(data.input).padStart(10)} ` +
                `${formatTokens(data.output).padStart(10)} ${formatTokens(data.cacheRead).padStart(12)} ${formatTokens(data.total).padStart(10)}`);
        }
    }
    const models = Object.entries(summary.byModel)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8);
    if (models.length > 0) {
        lines.push("");
        lines.push("BY MODEL (top 8)");
        lines.push(`${"MODEL".padEnd(36)} ${"REQ".padStart(6)} ${"TOTAL".padStart(10)}`);
        for (const [model, data] of models) {
            lines.push(`${model.padEnd(36)} ${String(data.requests).padStart(6)} ${formatTokens(data.total).padStart(10)}`);
        }
    }
    const capacity = options.capacity ?? [];
    lines.push("");
    if (capacity.length === 0) {
        lines.push("BUCKET CAPACITY: not measurable yet.");
        lines.push("Two quota snapshots with consumption in between are required; each `/antigravity-quota` records one.");
    }
    else {
        lines.push("BUCKET CAPACITY (measured per 1% of the bucket)");
        lines.push(`${"ACCOUNT".padEnd(26)} ${"BUCKET".padEnd(13)} ${"TOKENS/1%".padStart(10)} ${"CALLS/1%".padStart(9)} ${"MOVED".padStart(7)} ${"EST. (linear)".padStart(13)} ${"BASIS".padStart(7)}`);
        for (const estimate of capacity) {
            lines.push(`${estimate.account.padEnd(26)} ${estimate.bucket.padEnd(13)} ${formatTokens(estimate.tokensPerPoint).padStart(10)} ` +
                `${estimate.requestsPerPoint.toFixed(2).padStart(9)} ${`${estimate.windowsMoved}/${estimate.windowsObserved}`.padStart(7)} ` +
                `${formatTokens(estimate.estimatedFullBucketTokens).padStart(13)} ${estimate.basis.padStart(7)}`);
        }
        const partial = capacity.filter((estimate) => estimate.windowsMoved < estimate.windowsObserved);
        if (partial.length > 0) {
            lines.push("");
            lines.push("MOVED counts windows where the bucket actually dropped; the rest consumed tokens without moving it,");
            lines.push("so the linear estimate is informational. Measured behaviour beats a proportional assumption.");
        }
        const requestBilled = capacity.filter((estimate) => estimate.basis === "request");
        if (requestBilled.length > 0) {
            lines.push("");
            lines.push("BASIS=request: the bucket moved by a similar amount per call regardless of size,");
            lines.push("so the token estimate understates capacity. Use CALLS/1% for these buckets.");
        }
    }
    lines.push("");
    lines.push("Measured, not declared: the backend publishes no token allowance per bucket.");
    lines.push("Estimate = median of tokens consumed / percentage points dropped, per unchanged reset window.");
    return lines.join("\n");
}
//# sourceMappingURL=usage-ledger.js.map