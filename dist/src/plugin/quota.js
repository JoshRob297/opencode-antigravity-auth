import { ANTIGRAVITY_ENDPOINT_PROD, getAntigravityHeaders, ANTIGRAVITY_PROVIDER_ID, } from "../constants";
import { accessTokenExpired, formatRefreshParts, parseRefreshParts } from "./auth";
import { logQuotaFetch } from "./debug";
import { ensureProjectContext } from "./project";
import { refreshAccessToken } from "./token";
const FETCH_TIMEOUT_MS = 10000;
export function formatDuration(ms) {
    const absMs = Math.abs(ms);
    const seconds = Math.floor(absMs / 1000);
    const d = Math.floor(seconds / (24 * 3600));
    const h = Math.floor((seconds % (24 * 3600)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0)
        return `${d}d ${h}h`;
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}
export function shortEmail(email) {
    return email.split("@")[0] || email;
}
export function progressBar(percent, width = 10) {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return `[${bar}] ${clamped.toFixed(0)}%`;
}
function buildAuthFromAccount(account) {
    return {
        type: "oauth",
        refresh: formatRefreshParts({
            refreshToken: account.refreshToken,
            projectId: account.projectId,
            managedProjectId: account.managedProjectId,
        }),
        access: undefined,
        expires: undefined,
    };
}
function normalizeRemainingFraction(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return value;
}
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function fetchQuotaSummary(accessToken, projectId) {
    const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
    const antigravityHeaders = getAntigravityHeaders();
    const body = projectId ? { project: projectId } : {};
    const response = await fetchWithTimeout(`${endpoint}/v1internal:retrieveUserQuotaSummary`, {
        method: "POST",
        headers: {
            ...antigravityHeaders,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`retrieveUserQuotaSummary failed (${response.status})`);
    }
    return (await response.json());
}
export async function fetchAvailableModels(accessToken, projectId) {
    const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
    const antigravityHeaders = getAntigravityHeaders();
    const body = projectId ? { project: projectId } : {};
    const response = await fetchWithTimeout(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
            ...antigravityHeaders,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`fetchAvailableModels failed (${response.status})`);
    }
    return (await response.json());
}
function applyAccountUpdates(account, auth) {
    const parts = parseRefreshParts(auth.refresh);
    if (!parts.refreshToken) {
        return undefined;
    }
    const updated = {
        ...account,
        refreshToken: parts.refreshToken,
        projectId: parts.projectId ?? account.projectId,
        managedProjectId: parts.managedProjectId ?? account.managedProjectId,
    };
    const changed = updated.refreshToken !== account.refreshToken ||
        updated.projectId !== account.projectId ||
        updated.managedProjectId !== account.managedProjectId;
    return changed ? updated : undefined;
}
export async function fetchAccountQuotaDetails(account, index, client, providerId = ANTIGRAVITY_PROVIDER_ID) {
    const disabled = account.enabled === false;
    let auth = buildAuthFromAccount(account);
    const now = Date.now();
    try {
        if (accessTokenExpired(auth)) {
            const refreshed = await refreshAccessToken(auth, client, providerId);
            if (!refreshed) {
                throw new Error("Token refresh failed");
            }
            auth = refreshed;
        }
        const projectContext = await ensureProjectContext(auth);
        auth = projectContext.auth;
        const updatedAccount = applyAccountUpdates(account, auth);
        const projectId = projectContext.effectiveProjectId;
        // 1. Try official retrieveUserQuotaSummary (Dual-Window 5h + Weekly)
        try {
            const summaryResponse = await fetchQuotaSummary(auth.access ?? "", projectId);
            if (summaryResponse.groups && summaryResponse.groups.length > 0) {
                const groups = [];
                for (const group of summaryResponse.groups) {
                    const groupDisplay = {
                        displayName: group.displayName || "Unknown Group",
                        description: group.description,
                    };
                    for (const bucket of group.buckets || []) {
                        const fraction = normalizeRemainingFraction(bucket.remainingFraction);
                        let resetTime;
                        if (bucket.resetTime) {
                            const parsed = new Date(bucket.resetTime);
                            resetTime = Number.isNaN(parsed.getTime()) ? new Date(now + 86400000) : parsed;
                        }
                        else {
                            resetTime = new Date(now + 86400000);
                        }
                        const timeUntilReset = Math.max(0, resetTime.getTime() - now);
                        const bucketDisplay = {
                            window: bucket.window || bucket.bucketId || "unknown",
                            displayName: bucket.displayName || bucket.bucketId || "Limit",
                            remainingPercentage: Math.round(fraction * 100),
                            remainingFraction: fraction,
                            resetTime,
                            timeUntilReset,
                            timeUntilResetFormatted: formatDuration(timeUntilReset),
                        };
                        const windowKey = (bucket.window || bucket.bucketId || "").toLowerCase();
                        if (windowKey.includes("5h")) {
                            groupDisplay.fiveHour = bucketDisplay;
                        }
                        else if (windowKey.includes("week")) {
                            groupDisplay.weekly = bucketDisplay;
                        }
                    }
                    groups.push(groupDisplay);
                }
                const cachedQuota = {};
                for (const g of groups) {
                    const groupName = g.displayName.toLowerCase();
                    const bucket = g.fiveHour || g.weekly;
                    if (bucket) {
                        if (groupName.includes("claude") || groupName.includes("gpt")) {
                            cachedQuota.claude = {
                                remainingFraction: bucket.remainingFraction,
                                resetTime: bucket.resetTime.toISOString(),
                            };
                        }
                        else if (groupName.includes("gemini")) {
                            cachedQuota["gemini-flash"] = {
                                remainingFraction: bucket.remainingFraction,
                                resetTime: bucket.resetTime.toISOString(),
                            };
                            cachedQuota["gemini-pro"] = {
                                remainingFraction: bucket.remainingFraction,
                                resetTime: bucket.resetTime.toISOString(),
                            };
                        }
                    }
                }
                return {
                    index,
                    email: account.email,
                    status: disabled ? "disabled" : "ok",
                    disabled,
                    groups,
                    cachedQuota,
                    updatedAccount,
                };
            }
        }
        catch {
            // Fallback to fetchAvailableModels
        }
        // 2. Fallback to fetchAvailableModels
        const quotaResponse = await fetchAvailableModels(auth.access ?? "", projectId);
        if (!quotaResponse.models) {
            return {
                index,
                email: account.email,
                status: disabled ? "disabled" : "ok",
                disabled,
                models: [],
                updatedAccount,
            };
        }
        const models = [];
        for (const [modelKey, info] of Object.entries(quotaResponse.models)) {
            const quotaInfo = info.quotaInfo;
            if (!quotaInfo)
                continue;
            const label = info.displayName || modelKey;
            const lowerLabel = label.toLowerCase();
            const ALLOWED_PREFIXES = [
                "gemini 3.1 pro",
                "gemini 3.5 flash",
                "gemini 3.6 flash",
                "gemini 3.7 flash",
                "claude opus 4.6",
                "claude sonnet 4.6",
            ];
            if (!ALLOWED_PREFIXES.some((p) => lowerLabel.startsWith(p))) {
                continue;
            }
            const fraction = normalizeRemainingFraction(quotaInfo.remainingFraction);
            let resetTime;
            if (quotaInfo.resetTime) {
                const parsed = new Date(quotaInfo.resetTime);
                resetTime = Number.isNaN(parsed.getTime()) ? new Date(now + 86400000) : parsed;
            }
            else {
                resetTime = new Date(now + 86400000);
            }
            const timeUntilReset = Math.max(0, resetTime.getTime() - now);
            models.push({
                label,
                modelId: info.model || modelKey,
                remainingPercentage: Math.round(fraction * 100),
                remainingFraction: fraction,
                isExhausted: fraction <= 0,
                resetTime,
                resetTimeDisplay: "",
                timeUntilReset,
                timeUntilResetFormatted: formatDuration(timeUntilReset),
                recommended: info.recommended,
                tagTitle: info.tagTitle,
            });
        }
        models.sort((a, b) => a.label.localeCompare(b.label));
        const cachedQuota = {};
        for (const m of models) {
            const lower = m.label.toLowerCase();
            if (lower.includes("claude")) {
                cachedQuota.claude = {
                    remainingFraction: m.remainingFraction,
                    resetTime: m.resetTime.toISOString(),
                };
            }
            else if (lower.includes("pro")) {
                cachedQuota["gemini-pro"] = {
                    remainingFraction: m.remainingFraction,
                    resetTime: m.resetTime.toISOString(),
                };
            }
            else if (lower.includes("flash")) {
                cachedQuota["gemini-flash"] = {
                    remainingFraction: m.remainingFraction,
                    resetTime: m.resetTime.toISOString(),
                };
            }
        }
        return {
            index,
            email: account.email,
            status: disabled ? "disabled" : "ok",
            disabled,
            models,
            cachedQuota,
            updatedAccount,
        };
    }
    catch (error) {
        return {
            index,
            email: account.email,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            disabled,
        };
    }
}
export async function checkAccountsQuota(accounts, client, providerId = ANTIGRAVITY_PROVIDER_ID) {
    const results = [];
    logQuotaFetch("start", accounts.length);
    for (const [index, account] of accounts.entries()) {
        results.push(await fetchAccountQuotaDetails(account, index, client, providerId));
    }
    return results;
}
export function formatQuotaReportMarkdown(results) {
    if (results.length === 0) {
        return "# ☁️ Antigravity Quota Status\n\nNo accounts configured.\n";
    }
    let output = "# ☁️ Antigravity Quota Status\n\n";
    const errors = [];
    const hasGroups = results.some((r) => r.status !== "error" && r.groups && r.groups.length > 0);
    if (hasGroups) {
        const groupMap = new Map();
        for (const result of results) {
            if (result.status === "error" || !result.groups) {
                errors.push(`${shortEmail(result.email || `Account ${result.index + 1}`)}: ${result.error || "error"}`);
                continue;
            }
            for (const g of result.groups) {
                let groupKey = g.displayName;
                if (groupKey.toLowerCase().includes("gemini")) {
                    groupKey = "🤖 Gemini Models (Flash / Pro)";
                }
                else if (groupKey.toLowerCase().includes("claude") || groupKey.toLowerCase().includes("gpt")) {
                    groupKey = "🧠 Claude & GPT Models (Opus / Sonnet / GPT-OSS)";
                }
                if (!groupMap.has(groupKey)) {
                    groupMap.set(groupKey, []);
                }
                groupMap.get(groupKey).push({
                    email: result.email || `account-${result.index + 1}`,
                    disabled: result.disabled,
                    fiveHour: g.fiveHour ? { percentage: g.fiveHour.remainingPercentage, resetIn: g.fiveHour.timeUntilResetFormatted } : undefined,
                    weekly: g.weekly ? { percentage: g.weekly.remainingPercentage, resetIn: g.weekly.timeUntilResetFormatted } : undefined,
                });
            }
        }
        if (errors.length > 0) {
            output += `⚠️ Errors: ${errors.join(", ")}\n\n`;
        }
        const sortedGroups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [groupName, accountsList] of sortedGroups) {
            output += `### ${groupName}\n`;
            output += "```text\n";
            output += "QUOTA (5h)          RESET (5h)  QUOTA (Weekly)      RESET (Wk)  ACCOUNT\n";
            const sorted = accountsList.sort((a, b) => {
                const pA = a.weekly?.percentage ?? a.fiveHour?.percentage ?? 0;
                const pB = b.weekly?.percentage ?? b.fiveHour?.percentage ?? 0;
                return pB - pA;
            });
            for (const acc of sorted) {
                const fiveHourBar = acc.fiveHour ? progressBar(acc.fiveHour.percentage) : "N/A";
                const fiveHourReset = acc.fiveHour ? acc.fiveHour.resetIn : "-";
                const weeklyBar = acc.weekly ? progressBar(acc.weekly.percentage) : "N/A";
                const weeklyReset = acc.weekly ? acc.weekly.resetIn : "-";
                const email = `${shortEmail(acc.email)}${acc.disabled ? " (disabled)" : ""}`;
                const fBarCol = fiveHourBar.padEnd(20, " ");
                const fResetCol = fiveHourReset.padEnd(12, " ");
                const wBarCol = weeklyBar.padEnd(20, " ");
                const wResetCol = weeklyReset.padEnd(12, " ");
                output += `${fBarCol}${fResetCol}${wBarCol}${wResetCol}${email}\n`;
            }
            output += "```\n\n";
        }
    }
    else {
        // Fallback model list format
        const familyMap = new Map();
        for (const result of results) {
            if (result.status === "error" || !result.models) {
                errors.push(`${shortEmail(result.email || `Account ${result.index + 1}`)}: ${result.error || "error"}`);
                continue;
            }
            for (const model of result.models) {
                const lower = model.label.toLowerCase();
                let familyName = "🤖 Gemini Models (Flash / Pro)";
                if (lower.includes("claude") || lower.includes("gpt")) {
                    familyName = "🧠 Claude Models (Opus / Sonnet)";
                }
                if (!familyMap.has(familyName)) {
                    familyMap.set(familyName, new Map());
                }
                const accountMap = familyMap.get(familyName);
                const accKey = result.email || `account-${result.index + 1}`;
                if (!accountMap.has(accKey)) {
                    accountMap.set(accKey, {
                        percentage: model.remainingPercentage,
                        resetIn: model.timeUntilResetFormatted,
                        disabled: result.disabled,
                    });
                }
            }
        }
        if (errors.length > 0) {
            output += `⚠️ Errors: ${errors.join(", ")}\n\n`;
        }
        const sortedFamilies = Array.from(familyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [familyName, accountMap] of sortedFamilies) {
            output += `### ${familyName}\n`;
            output += "```text\n";
            output += "QUOTA               RESET IN    ACCOUNT\n";
            const accountsList = Array.from(accountMap.entries()).map(([email, info]) => ({
                email,
                percentage: info.percentage,
                resetIn: info.resetIn,
                disabled: info.disabled,
            }));
            const sorted = accountsList.sort((a, b) => b.percentage - a.percentage);
            for (const acc of sorted) {
                const bar = progressBar(acc.percentage).padEnd(20, " ");
                const reset = acc.resetIn.padEnd(12, " ");
                const email = `${shortEmail(acc.email)}${acc.disabled ? " (disabled)" : ""}`;
                output += `${bar}${reset}${email}\n`;
            }
            output += "```\n\n";
        }
    }
    return output.trimEnd() + "\n";
}
//# sourceMappingURL=quota.js.map