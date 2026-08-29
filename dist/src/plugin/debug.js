import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { homedir } from "node:os";
import { deriveDebugPolicy, formatAccountContextLabel, formatAccountLabel, formatBodyPreviewForLog, formatErrorForLog, isTruthyFlag, truncateTextForLog, } from "./logging-utils";
import { ensureGitignoreSync } from "./storage";
const MAX_BODY_PREVIEW_CHARS = 12000;
const MAX_BODY_LOG_CHARS = 50000;
export const DEBUG_MESSAGE_PREFIX = "[opencode-antigravity-auth debug]";
let debugState = null;
/**
 * Get the OS-specific config directory.
 */
function getConfigDir() {
    const platform = process.platform;
    if (platform === "win32") {
        return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "opencode");
    }
    const xdgConfig = env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgConfig, "opencode");
}
/**
 * Returns the logs directory, creating it if needed.
 */
function getLogsDir(customLogDir) {
    const logsDir = customLogDir || join(getConfigDir(), "antigravity-logs");
    try {
        mkdirSync(logsDir, { recursive: true });
    }
    catch {
        // Directory may already exist or we don't have permission
    }
    return logsDir;
}
/**
 * Builds a timestamped log file path.
 */
function createLogFilePath(customLogDir) {
    const logsDir = getLogsDir(customLogDir);
    cleanupOldLogs(logsDir, 25);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return join(logsDir, `antigravity-debug-${timestamp}.log`);
}
/**
 * Cleans up old log files, keeping only the most recent maxFiles.
 */
function cleanupOldLogs(logsDir, maxFiles) {
    try {
        const files = readdirSync(logsDir)
            .filter((file) => file.startsWith("antigravity-debug-") && file.endsWith(".log"))
            .map((file) => join(logsDir, file));
        if (files.length <= maxFiles) {
            return;
        }
        const sortedFiles = files
            .map((file) => ({
            file,
            mtime: statSync(file).mtimeMs,
        }))
            .sort((a, b) => b.mtime - a.mtime);
        for (let i = maxFiles; i < sortedFiles.length; i++) {
            try {
                unlinkSync(sortedFiles[i].file);
            }
            catch {
                // Ignore deletion errors
            }
        }
    }
    catch {
        // Ignore directory read errors
    }
}
/**
 * Creates a log writer function that writes to a file.
 */
function createLogWriter(filePath) {
    if (!filePath) {
        return () => { };
    }
    try {
        const stream = createWriteStream(filePath, { flags: "a", mode: 0o600 });
        stream.on("error", () => { });
        return (line) => {
            const timestamp = new Date().toISOString();
            const formatted = `[${timestamp}] ${line}`;
            stream.write(`${formatted}\n`);
        };
    }
    catch {
        return () => { };
    }
}
/**
 * Initialize or reinitialize debug state with the given config.
 * Call this once at plugin startup after loading config.
 */
export function initializeDebug(config) {
    // Config takes precedence, but env var can force enable for debugging
    const envDebugFlag = env.OPENCODE_ANTIGRAVITY_DEBUG ?? "";
    const { debugEnabled } = deriveDebugPolicy({
        configDebug: config.debug,
        configDebugTui: config.debug_tui,
        envDebugFlag,
        envDebugTuiFlag: env.OPENCODE_ANTIGRAVITY_DEBUG_TUI,
    });
    const debugTuiEnabled = config.debug_tui || isTruthyFlag(env.OPENCODE_ANTIGRAVITY_DEBUG_TUI);
    const logFilePath = debugEnabled ? createLogFilePath(config.log_dir) : undefined;
    const logWriter = createLogWriter(logFilePath);
    if (debugEnabled) {
        ensureGitignoreSync(getConfigDir());
    }
    debugState = {
        debugEnabled,
        debugTuiEnabled,
        logFilePath,
        logWriter,
    };
}
/**
 * Get the current debug state, initializing with defaults if needed.
 * This allows the module to work even before initializeDebug is called.
 */
function getDebugState() {
    if (!debugState) {
        // Fallback to env-based initialization for backward compatibility
        const { debugEnabled } = deriveDebugPolicy({
            configDebug: false,
            configDebugTui: false,
            envDebugFlag: env.OPENCODE_ANTIGRAVITY_DEBUG,
            envDebugTuiFlag: env.OPENCODE_ANTIGRAVITY_DEBUG_TUI,
        });
        const debugTuiEnabled = isTruthyFlag(env.OPENCODE_ANTIGRAVITY_DEBUG_TUI);
        const logFilePath = debugEnabled ? createLogFilePath() : undefined;
        const logWriter = createLogWriter(logFilePath);
        debugState = {
            debugEnabled,
            debugTuiEnabled,
            logFilePath,
            logWriter,
        };
    }
    return debugState;
}
// =============================================================================
// Public API
// =============================================================================
export function isDebugEnabled() {
    return getDebugState().debugEnabled;
}
export function isDebugTuiEnabled() {
    return getDebugState().debugTuiEnabled;
}
export function getLogFilePath() {
    return getDebugState().logFilePath;
}
let requestCounter = 0;
/**
 * Begins a debug trace for an Antigravity request.
 */
export function startAntigravityDebugRequest(meta) {
    const state = getDebugState();
    if (!state.debugEnabled) {
        return null;
    }
    const id = `ANTIGRAVITY-${++requestCounter}`;
    const method = meta.method ?? "GET";
    logDebug(`[Antigravity Debug ${id}] pid=${process.pid} ${method} ${meta.resolvedUrl}`);
    if (meta.originalUrl && meta.originalUrl !== meta.resolvedUrl) {
        logDebug(`[Antigravity Debug ${id}] Original URL: ${meta.originalUrl}`);
    }
    if (meta.projectId) {
        logDebug(`[Antigravity Debug ${id}] Project: ${meta.projectId}`);
    }
    logDebug(`[Antigravity Debug ${id}] Streaming: ${meta.streaming ? "yes" : "no"}`);
    logDebug(`[Antigravity Debug ${id}] Headers: ${JSON.stringify(maskHeaders(meta.headers))}`);
    const bodyPreview = formatBodyPreviewForLog(meta.body, MAX_BODY_PREVIEW_CHARS);
    if (bodyPreview) {
        logDebug(`[Antigravity Debug ${id}] Body Preview: ${bodyPreview}`);
    }
    return { id, streaming: meta.streaming, startedAt: Date.now() };
}
/**
 * Logs response details for a previously started debug trace.
 */
export function logAntigravityDebugResponse(context, response, meta = {}) {
    const state = getDebugState();
    if (!state.debugEnabled || !context) {
        return;
    }
    const durationMs = Date.now() - context.startedAt;
    logDebug(`[Antigravity Debug ${context.id}] Response ${response.status} ${response.statusText} (${durationMs}ms)`);
    logDebug(`[Antigravity Debug ${context.id}] Response Headers: ${JSON.stringify(maskHeaders(meta.headersOverride ?? response.headers))}`);
    if (meta.note) {
        logDebug(`[Antigravity Debug ${context.id}] Note: ${meta.note}`);
    }
    if (meta.error) {
        logDebug(`[Antigravity Debug ${context.id}] Error: ${formatErrorForLog(meta.error)}`);
    }
    if (meta.body) {
        logDebug(`[Antigravity Debug ${context.id}] Response Body Preview: ${truncateTextForLog(meta.body, MAX_BODY_PREVIEW_CHARS)}`);
    }
}
/**
 * Obscures sensitive headers and returns a plain object for logging.
 */
function maskHeaders(headers) {
    if (!headers) {
        return {};
    }
    const result = {};
    const parsed = headers instanceof Headers ? headers : new Headers(headers);
    parsed.forEach((value, key) => {
        if (key.toLowerCase() === "authorization") {
            result[key] = "[redacted]";
        }
        else {
            result[key] = value;
        }
    });
    return result;
}
/**
 * Writes a single debug line using the configured writer.
 */
function logDebug(line) {
    getDebugState().logWriter(line);
}
function runWithDebugEnabled(action) {
    if (!getDebugState().debugEnabled)
        return;
    action();
}
export function logAccountContext(label, info) {
    runWithDebugEnabled(() => {
        const accountLabel = formatAccountContextLabel(info.email, info.index);
        const indexLabel = info.index >= 0 ? `${info.index + 1}/${info.totalAccounts}` : `-/${info.totalAccounts}`;
        let rateLimitInfo = "";
        if (info.rateLimitState && Object.keys(info.rateLimitState).length > 0) {
            const now = Date.now();
            const activeRateLimits = {};
            for (const [key, resetTime] of Object.entries(info.rateLimitState)) {
                if (typeof resetTime === "number" && resetTime > now) {
                    const remainingSec = Math.ceil((resetTime - now) / 1000);
                    activeRateLimits[key] = `${remainingSec}s`;
                }
            }
            if (Object.keys(activeRateLimits).length > 0) {
                rateLimitInfo = ` rateLimits=${JSON.stringify(activeRateLimits)}`;
            }
        }
        logDebug(`[Account] ${label}: ${accountLabel} (${indexLabel}) family=${info.family}${rateLimitInfo}`);
    });
}
export function logRateLimitEvent(accountIndex, email, family, status, retryAfterMs, bodyInfo) {
    runWithDebugEnabled(() => {
        const accountLabel = formatAccountLabel(email, accountIndex);
        logDebug(`[RateLimit] ${status} on ${accountLabel} family=${family} retryAfterMs=${retryAfterMs}`);
        if (bodyInfo.message) {
            logDebug(`[RateLimit] message: ${bodyInfo.message}`);
        }
        if (bodyInfo.quotaResetTime) {
            logDebug(`[RateLimit] quotaResetTime: ${bodyInfo.quotaResetTime}`);
        }
        if (bodyInfo.retryDelayMs !== undefined && bodyInfo.retryDelayMs !== null) {
            logDebug(`[RateLimit] body retryDelayMs: ${bodyInfo.retryDelayMs}`);
        }
        if (bodyInfo.reason) {
            logDebug(`[RateLimit] reason: ${bodyInfo.reason}`);
        }
    });
}
export function logRateLimitSnapshot(family, accounts) {
    runWithDebugEnabled(() => {
        const now = Date.now();
        const entries = accounts.map((account) => {
            const label = formatAccountLabel(account.email, account.index);
            const reset = account.rateLimitResetTimes?.[family];
            if (typeof reset !== "number") {
                return `${label}=ready`;
            }
            const remaining = Math.max(0, reset - now);
            const seconds = Math.ceil(remaining / 1000);
            return `${label}=wait ${seconds}s`;
        });
        logDebug(`[RateLimit] snapshot family=${family} ${entries.join(" | ")}`);
    });
}
export async function logResponseBody(context, response, status) {
    const state = getDebugState();
    if (!state.debugEnabled || !context)
        return undefined;
    try {
        const text = await response.clone().text();
        const preview = truncateTextForLog(text, MAX_BODY_LOG_CHARS);
        logDebug(`[Antigravity Debug ${context.id}] Response Body (${status}): ${preview}`);
        return text;
    }
    catch (e) {
        logDebug(`[Antigravity Debug ${context.id}] Failed to read response body: ${formatErrorForLog(e)}`);
        return undefined;
    }
}
export function logModelFamily(url, extractedModel, family) {
    runWithDebugEnabled(() => {
        logDebug(`[ModelFamily] url=${url} model=${extractedModel ?? "unknown"} family=${family}`);
    });
}
export function debugLogToFile(message) {
    runWithDebugEnabled(() => {
        logDebug(message);
    });
}
/**
 * Logs a toast message to the debug file.
 * This helps correlate what the user saw with debug events.
 */
export function logToast(message, variant) {
    runWithDebugEnabled(() => {
        const variantLabel = variant.toUpperCase();
        logDebug(`[Toast/${variantLabel}] ${message}`);
    });
}
/**
 * Logs retry attempt information.
 * @param maxAttempts - Use -1 for unlimited retries
 */
export function logRetryAttempt(attempt, maxAttempts, reason, delayMs) {
    runWithDebugEnabled(() => {
        const delayInfo = delayMs !== undefined ? ` delay=${delayMs}ms` : "";
        const maxInfo = maxAttempts < 0 ? "∞" : maxAttempts.toString();
        logDebug(`[Retry] Attempt ${attempt}/${maxInfo} reason=${reason}${delayInfo}`);
    });
}
/**
 * Logs cache hit/miss information from response usage metadata.
 */
export function logCacheStats(model, cacheReadTokens, cacheWriteTokens, totalInputTokens) {
    runWithDebugEnabled(() => {
        const cacheHitRate = totalInputTokens > 0
            ? Math.round((cacheReadTokens / totalInputTokens) * 100)
            : 0;
        const status = cacheReadTokens > 0 ? "HIT" : (cacheWriteTokens > 0 ? "WRITE" : "MISS");
        logDebug(`[Cache] ${status} model=${model} read=${cacheReadTokens} write=${cacheWriteTokens} total=${totalInputTokens} hitRate=${cacheHitRate}%`);
    });
}
/**
 * Logs quota status for an account.
 */
export function logQuotaStatus(accountEmail, accountIndex, quotaPercent, family) {
    runWithDebugEnabled(() => {
        const accountLabel = formatAccountLabel(accountEmail, accountIndex);
        const familyInfo = family ? ` family=${family}` : "";
        const status = quotaPercent <= 0 ? "EXHAUSTED" : quotaPercent < 20 ? "LOW" : "OK";
        logDebug(`[Quota] ${accountLabel} remaining=${quotaPercent.toFixed(1)}% status=${status}${familyInfo}`);
    });
}
/**
 * Logs background quota fetch events.
 */
export function logQuotaFetch(event, accountCount, details) {
    runWithDebugEnabled(() => {
        const countInfo = accountCount !== undefined ? ` accounts=${accountCount}` : "";
        const detailsInfo = details ? ` ${details}` : "";
        logDebug(`[QuotaFetch] ${event.toUpperCase()}${countInfo}${detailsInfo}`);
    });
}
/**
 * Logs which model is being used for a request.
 */
export function logModelUsed(requestedModel, actualModel, accountEmail) {
    runWithDebugEnabled(() => {
        const accountInfo = accountEmail ? ` account=${accountEmail}` : "";
        if (requestedModel !== actualModel) {
            logDebug(`[Model] requested=${requestedModel} actual=${actualModel}${accountInfo}`);
        }
        else {
            logDebug(`[Model] ${actualModel}${accountInfo}`);
        }
    });
}
//# sourceMappingURL=debug.js.map