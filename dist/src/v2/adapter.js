/**
 * OpenCode v2 Plugin Adapter
 *
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */
import { checkAccountsQuota, formatQuotaReportMarkdown, fetchAvailableModels } from "../plugin/quota";
import { EngineStatsManager } from "../plugin/stats";
import { loadConfig, initRuntimeConfig } from "../plugin/config";
import { loadAccounts, saveAccounts } from "../plugin/storage";
import { AccountManager, computeSoftQuotaCacheTtlMs, resolveQuotaGroup } from "../plugin/accounts";
import { refreshAccessToken } from "../plugin/token";
import { formatRefreshParts, parseRefreshParts, accessTokenExpired } from "../plugin/auth";
import { persistAccountPool } from "../plugin";
import { authorizeAntigravity, exchangeAntigravity } from "../antigravity/oauth";
import { resolveCachedAuth } from "../plugin/cache";
import { executeSearch } from "../plugin/search";
import { createLogger } from "../plugin/logger";
import { ANTIGRAVITY_PROVIDER_ID } from "../constants";
import { prepareAntigravityRequest, transformAntigravityResponse, isGenerativeLanguageRequest, } from "../plugin/request";
import { OPENCODE_MODEL_DEFINITIONS } from "../plugin/config/models";
import { collectDiscoveredModels } from "../plugin/config/model-discovery";
import { updateOpencodeConfig } from "../plugin/config/updater";
const log = createLogger("v2-adapter");
const MOCK_CLIENT = { tui: { showToast: async () => { } } };
/**
 * Resolves a valid access token for an account, reusing the shared auth cache
 * (keyed by the packed refresh string) so we do not hit Google's OAuth endpoint
 * on every single model request. Only refreshes when the cached token is
 * missing or within the expiry buffer.
 */
async function getAccessToken(account) {
    const packedRefresh = formatRefreshParts({
        refreshToken: account.refreshToken,
        projectId: account.projectId,
        managedProjectId: account.managedProjectId,
    });
    const mockAuth = {
        type: "oauth",
        refresh: packedRefresh,
        access: "",
        expires: 0,
    };
    const resolved = resolveCachedAuth(mockAuth);
    if (resolved.access && !accessTokenExpired(resolved)) {
        return resolved.access;
    }
    try {
        const refreshed = await refreshAccessToken(mockAuth, MOCK_CLIENT, ANTIGRAVITY_PROVIDER_ID);
        if (refreshed?.access && !accessTokenExpired(refreshed)) {
            return refreshed.access;
        }
    }
    catch (err) {
        log.warn(`Token refresh error in v2 adapter: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Fall back to any (possibly expired) token we already had.
    return resolved.access || "";
}
function resolveFamilyFromRequest(url, bodyText) {
    let modelName = "";
    try {
        const json = JSON.parse(bodyText);
        if (typeof json.model === "string") {
            modelName = json.model;
        }
    }
    catch {
        // not JSON
    }
    if (!modelName) {
        const urlMatch = url.match(/models\/([^:]+)/);
        if (urlMatch && urlMatch[1]) {
            modelName = urlMatch[1];
        }
    }
    const lower = modelName.toLowerCase();
    if (lower.includes("claude") || lower.includes("opus") || lower.includes("sonnet")) {
        return { family: "claude", modelName };
    }
    return { family: "gemini", modelName };
}
// Shared AccountManager so in-memory quota cache survives between requests.
let sharedAccountManagerPromise = null;
let quotaRefreshInFlight = null;
function getSharedAccountManager() {
    if (!sharedAccountManagerPromise) {
        sharedAccountManagerPromise = AccountManager.loadFromDisk().catch((err) => {
            sharedAccountManagerPromise = null;
            throw err;
        });
    }
    return sharedAccountManagerPromise;
}
/**
 * Refreshes the in-memory + on-disk quota cache from live fetchAvailableModels
 * when it is stale, so getCurrentOrNextForFamily() can route by real remaining
 * quota instead of blindly reusing a depleted account.
 */
async function refreshQuotaCacheForFamily(manager, family) {
    if (quotaRefreshInFlight) {
        await quotaRefreshInFlight;
        return;
    }
    const ttlMs = computeSoftQuotaCacheTtlMs("auto", 15);
    const snapshot = manager.getAccountsSnapshot();
    const now = Date.now();
    const stale = snapshot.some((a) => a.enabled !== false && (a.cachedQuotaUpdatedAt == null || now - a.cachedQuotaUpdatedAt > ttlMs));
    const quotaGroup = resolveQuotaGroup(family);
    const allDepleted = snapshot.every((a) => a.enabled === false || (a.cachedQuota && (a.cachedQuota[quotaGroup]?.remainingFraction ?? 1) <= 0.1));
    if (!stale && !allDepleted)
        return;
    const refresh = (async () => {
        const active = snapshot.filter((a) => a.enabled !== false);
        const results = await Promise.all(active.map(async (acc) => {
            try {
                const accessToken = await getAccessToken(acc.parts);
                if (!accessToken)
                    return null;
                const projectId = acc.parts.managedProjectId || acc.parts.projectId || "default-cli-project";
                const resp = await fetchAvailableModels(accessToken, projectId);
                return { index: acc.index, models: (resp.models || {}) };
            }
            catch (e) {
                log.warn(`[quota refresh] failed for ${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
                return null;
            }
        }));
        for (const r of results) {
            if (!r)
                continue;
            let minClaude = Infinity;
            let resetClaude;
            let minFlash = Infinity;
            let resetFlash;
            let minPro = Infinity;
            let resetPro;
            for (const [key, m] of Object.entries(r.models)) {
                const qi = m?.quotaInfo;
                if (!qi)
                    continue;
                const frac = typeof qi.remainingFraction === "number" ? Math.max(0, Math.min(1, qi.remainingFraction)) : NaN;
                const label = (m.displayName || key || "").toLowerCase();
                if (label.includes("claude")) {
                    // Claude models in Antigravity RPC frequently omit remainingFraction when exhausted or subject to weekly bucket.
                    // If remainingFraction is numeric, use it. Otherwise, if resetTime is present, remainingFraction is exhausted (0).
                    const claudeFrac = Number.isFinite(frac) ? frac : (qi.resetTime ? 0 : 1);
                    if (claudeFrac < minClaude) {
                        minClaude = claudeFrac;
                        resetClaude = qi.resetTime;
                    }
                }
                else if (label.includes("flash")) {
                    if (Number.isFinite(frac) && frac < minFlash) {
                        minFlash = frac;
                        resetFlash = qi.resetTime;
                    }
                }
                else if (label.includes("pro")) {
                    if (Number.isFinite(frac) && frac < minPro) {
                        minPro = frac;
                        resetPro = qi.resetTime;
                    }
                }
            }
            const quota = {};
            if (Number.isFinite(minClaude))
                quota.claude = { remainingFraction: minClaude, resetTime: resetClaude };
            if (Number.isFinite(minFlash))
                quota["gemini-flash"] = { remainingFraction: minFlash, resetTime: resetFlash };
            if (Number.isFinite(minPro))
                quota["gemini-pro"] = { remainingFraction: minPro, resetTime: resetPro };
            if (Object.keys(quota).length > 0) {
                manager.updateQuotaCache(r.index, quota);
            }
        }
        // Persist the refreshed cache to disk surgically so future restarts benefit.
        try {
            const storage = await loadAccounts();
            if (!storage)
                return;
            const updatedSnapshot = manager.getAccountsSnapshot();
            for (const r of results) {
                if (!r)
                    continue;
                const stored = storage.accounts[r.index];
                const snap = updatedSnapshot[r.index];
                if (stored && snap) {
                    stored.cachedQuota = snap.cachedQuota;
                    stored.cachedQuotaUpdatedAt = snap.cachedQuotaUpdatedAt;
                }
            }
            if (!process.env.VITEST) {
                await saveAccounts(storage);
            }
            log.info("[v2 routing] Quota cache refreshed from live fetchAvailableModels");
        }
        catch (e) {
            log.warn(`[v2 routing] Failed to persist quota cache: ${e instanceof Error ? e.message : String(e)}`);
        }
    })();
    quotaRefreshInFlight = refresh;
    try {
        await refresh;
    }
    finally {
        quotaRefreshInFlight = null;
    }
}
async function getQuotaReport() {
    const storage = await loadAccounts();
    if (!storage || storage.accounts.length === 0) {
        return "No Antigravity accounts configured.";
    }
    const mockClient = { tui: { showToast: async () => { } } };
    const quotaResults = await checkAccountsQuota(storage.accounts, mockClient, ANTIGRAVITY_PROVIDER_ID);
    return formatQuotaReportMarkdown(quotaResults);
}
async function performSearch(query, urls, thinking = true, signal) {
    const storage = await loadAccounts();
    if (!storage || storage.accounts.length === 0) {
        return "Error: No Antigravity accounts configured. Please log in first.";
    }
    const activeIndex = storage.activeIndex ?? 0;
    const primary = storage.accounts[activeIndex] || storage.accounts[0];
    if (!primary || !primary.refreshToken) {
        return "Error: Selected account has no valid credentials.";
    }
    const projectId = primary.managedProjectId || primary.projectId || "default-cli-project";
    try {
        const accessToken = await getAccessToken(primary);
        if (!accessToken) {
            return "Error: Failed to obtain access token for search.";
        }
        return await executeSearch({ query, urls, thinking }, accessToken, projectId, signal);
    }
    catch (error) {
        return `Search error: ${error instanceof Error ? error.message : String(error)}`;
    }
}
/**
 * OpenCode v2 setup hook.
 * Called automatically by the v2 plugin supervisor during startup.
 */
/**
 * Disables every model of a provider that is not part of the curated catalog.
 *
 * models.dev publishes a `google` provider with the full Gemini lineup. The
 * Antigravity OAuth credential makes that provider available, so all of those
 * models show up in the picker even though only the curated Antigravity ones
 * can be served. Returns how many entries were disabled.
 *
 * Fail-open: an editor without `list`, or any throw, leaves the list untouched.
 */
export function hideForeignModels(editor, providerID, curatedIds) {
    try {
        const listFn = editor?.list;
        if (typeof listFn !== "function")
            return 0;
        let hidden = 0;
        for (const existing of listFn.call(editor, providerID) ?? []) {
            if (!existing?.id || curatedIds.has(existing.id))
                continue;
            editor.update(providerID, existing.id, (draft) => {
                draft.enabled = false;
            });
            hidden++;
        }
        return hidden;
    }
    catch {
        return 0;
    }
}
export async function setupV2(context) {
    const directory = context.location?.directory || process.cwd();
    const config = loadConfig(directory);
    initRuntimeConfig(config);
    log.info("Initializing opencode-antigravity-auth in OpenCode v2 mode");
    const pendingBySession = new Map();
    const lastFailedMetaBySession = new Map();
    const MAX_PENDING_PER_SESSION = 32;
    const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
    const enqueuePending = (sessionID, entry) => {
        const queue = pendingBySession.get(sessionID) ?? [];
        const cutoff = Date.now() - PENDING_MAX_AGE_MS;
        while (queue.length > 0 && queue[0].createdAt < cutoff) {
            queue.shift();
        }
        queue.push(entry);
        if (queue.length > MAX_PENDING_PER_SESSION) {
            queue.shift();
        }
        pendingBySession.set(sessionID, queue);
    };
    const peekPending = (sessionID) => pendingBySession.get(sessionID)?.[0];
    const dequeuePending = (sessionID) => {
        const queue = pendingBySession.get(sessionID);
        if (!queue || queue.length === 0)
            return undefined;
        const entry = queue.shift();
        if (queue.length === 0) {
            pendingBySession.delete(sessionID);
        }
        return entry;
    };
    // 1. Session hooks: Native HTTP request/response pipeline and multi-account retry
    if (context.session && typeof context.session.hook === "function") {
        // Intercept outbound HTTP requests to Google Cloud Code
        await context.session.hook("http.request", async (event) => {
            const url = event.request?.url || "";
            if (!isGenerativeLanguageRequest(url)) {
                return;
            }
            const storage = await loadAccounts();
            if (!storage || storage.accounts.length === 0) {
                log.warn("Antigravity request detected but no accounts configured");
                return;
            }
            let bodyText = "";
            try {
                bodyText = await event.request.clone().text();
            }
            catch {
                bodyText = "";
            }
            const { family, modelName } = resolveFamilyFromRequest(url, bodyText);
            // Multi-account rotation via AccountManager (shared singleton keeps quota cache warm)
            let accountManager = null;
            try {
                accountManager = await getSharedAccountManager();
                await refreshQuotaCacheForFamily(accountManager, family);
            }
            catch (err) {
                log.warn(`Failed to initialize AccountManager in v2 adapter: ${err}`);
            }
            let selectedAccount = null;
            if (accountManager && accountManager.getAccountCount() > 0) {
                const strategy = config.account_selection_strategy || "hybrid";
                selectedAccount = accountManager.getCurrentOrNextForFamily(family, modelName, strategy, "antigravity", config.pid_offset_enabled, config.soft_quota_threshold_percent);
                if (!selectedAccount) {
                    const blockedReasons = accountManager.getAllBlockedReasons(family, modelName, "antigravity");
                    const reasonsFormatted = blockedReasons.map((r) => `• ${r.email}: ${r.reason}`).join("\n");
                    const minWaitMs = accountManager.getMinWaitTimeForFamily(family, modelName, "antigravity");
                    const waitTimeFormatted = minWaitMs > 0 ? `${Math.ceil(minWaitMs / 60000)}m` : "desconocido";
                    const userMessage = `[Antigravity] Todas tus cuentas (${accountManager.getAccountCount()}) tienen la cuota agotada o bloqueada para ${family}.\n\n` +
                        `Detalle por cuenta:\n${reasonsFormatted}\n\n` +
                        `Sugerencias:\n` +
                        `1. Cambia temporalmente a otro modelo disponible (ej: google/antigravity-gemini-3.8-flash).\n` +
                        `2. Ejecuta /antigravity-quota o consulta antigravity_quota para revisar los reseteos.\n` +
                        `3. Agrega otra cuenta ejecutando 'opencode auth login' o espera el reseteo (~${waitTimeFormatted}).`;
                    log.warn(`[v2 routing] All accounts blocked for ${family}. Early terminating with structured error response.`);
                    // Intercept request to stop SessionRunner from hanging by returning synthetic response in http.response
                    enqueuePending(event.sessionID ?? "default", {
                        prepared: {
                            blockedEarly: true,
                            userMessage,
                        },
                        createdAt: Date.now(),
                    });
                    return;
                }
            }
            const activeIndex = selectedAccount ? selectedAccount.index : (storage.activeIndex ?? 0);
            const account = (selectedAccount && selectedAccount.parts)
                ? {
                    email: selectedAccount.email,
                    refreshToken: selectedAccount.parts.refreshToken,
                    projectId: selectedAccount.parts.projectId,
                    managedProjectId: selectedAccount.parts.managedProjectId,
                }
                : (storage.accounts[activeIndex] || storage.accounts[0]);
            if (!account || !account.refreshToken) {
                return;
            }
            // Keep storage activeIndex in sync for stats & CLI views
            if (storage.activeIndex !== activeIndex) {
                storage.activeIndex = activeIndex;
                await saveAccounts(storage).catch(() => { });
            }
            log.info(`[v2 routing] Selected account idx=${activeIndex} (${account.email || "unknown"}) for family=${family} model=${modelName || "default"}`);
            let accessToken = "";
            try {
                accessToken = await getAccessToken(account);
            }
            catch (err) {
                log.warn(`Token resolution error in v2 adapter: ${err instanceof Error ? err.message : String(err)}`);
            }
            const headers = new Headers(event.request.headers);
            if (accessToken) {
                headers.set("Authorization", `Bearer ${accessToken}`);
            }
            const prepared = prepareAntigravityRequest(url, {
                method: event.request.method,
                headers,
                body: bodyText,
            }, accessToken, account.managedProjectId || account.projectId || "default-cli-project", undefined, "antigravity");
            enqueuePending(event.sessionID ?? "default", {
                prepared,
                family,
                accountIndex: activeIndex,
                createdAt: Date.now(),
            });
            event.request = new Request(prepared.request, prepared.init);
        });
        // Transform inbound SSE responses and extract thinking tokens
        await context.session.hook("http.response", async (event) => {
            const sessionKey = event.sessionID ?? "default";
            const entry = dequeuePending(sessionKey);
            if (!entry || !entry.prepared) {
                return;
            }
            const prepared = entry.prepared;
            if (prepared.blockedEarly) {
                event.response = new Response(JSON.stringify({
                    error: {
                        code: 429,
                        message: prepared.userMessage,
                        status: "RESOURCE_EXHAUSTED",
                    },
                }), {
                    status: 429,
                    statusText: "Too Many Requests",
                    headers: {
                        "content-type": "application/json",
                        "x-should-retry": "false",
                    },
                });
                return;
            }
            // Mark account as used or rate-limited on response arrival
            const meta = entry.family !== undefined && entry.accountIndex !== undefined
                ? { family: entry.family, accountIndex: entry.accountIndex }
                : undefined;
            const isRateLimitedOrQuota = event.response && (event.response.status === 429 || event.response.status === 403);
            if (meta !== undefined) {
                try {
                    const mgr = await getSharedAccountManager();
                    if (event.response?.ok) {
                        mgr.markAccountUsed(meta.accountIndex);
                    }
                    else if (isRateLimitedOrQuota) {
                        // Immediately mark failed account as limited in shared AccountManager & disk cache
                        mgr.markRateLimitedByIndex(meta.accountIndex, 60_000, meta.family, "antigravity");
                        // Invalidate cached quota updatedAt so next request refreshes from live backend
                        const failedAccountSnap = mgr.getAccounts()[meta.accountIndex];
                        if (failedAccountSnap) {
                            failedAccountSnap.cachedQuotaUpdatedAt = 0;
                        }
                        // Advance activeIndex immediately in storage
                        if (!process.env.VITEST) {
                            const storage = await loadAccounts();
                            if (storage && storage.accounts.length > 1) {
                                const nextIdx = (meta.accountIndex + 1) % storage.accounts.length;
                                storage.activeIndex = nextIdx;
                                const failedAccount = storage.accounts[meta.accountIndex];
                                if (failedAccount) {
                                    failedAccount.cachedQuotaUpdatedAt = 0;
                                }
                                await saveAccounts(storage).catch(() => { });
                                log.warn(`[v2 routing] Account idx=${meta.accountIndex} encountered status=${event.response.status}. Switched activeIndex -> ${nextIdx}`);
                            }
                        }
                    }
                }
                catch (e) {
                    log.warn(`[v2 routing] Error handling response arrival accounting: ${e}`);
                }
            }
            try {
                const transformed = await transformAntigravityResponse(event.response, prepared.streaming, null, prepared.requestedModel, prepared.projectId, prepared.endpoint, prepared.effectiveModel, prepared.sessionId, prepared.toolDebugMissing, prepared.toolDebugSummary, prepared.toolDebugPayload, undefined, async (ratings) => {
                    if (!config.safety_shield?.enabled)
                        return;
                    const highRisk = ratings.filter((r) => r.probability === "HIGH" || r.probability === "MEDIUM");
                    if (highRisk.length === 0)
                        return;
                    if (config.safety_shield.log_ratings) {
                        const details = highRisk.map((r) => `${r.category}:${r.probability}`).join(", ");
                        log.warn(`[Safety Shield] Filter risk detected: ${details}`);
                    }
                    const threshold = config.safety_shield.auto_rotate_threshold ?? 2;
                    if (threshold > 0) {
                        const storage = await loadAccounts();
                        if (storage && storage.accounts.length > 1) {
                            const nextIndex = ((storage.activeIndex ?? 0) + 1) % storage.accounts.length;
                            storage.activeIndex = nextIndex;
                            if (!process.env.VITEST) {
                                await saveAccounts(storage);
                            }
                            log.warn(`[Safety Shield] High risk threshold reached. Preventive rotation to account index ${nextIndex}`);
                        }
                    }
                });
                event.response = transformed;
                // If Google returned 429/403 or quota exceeded, inject x-should-retry: true into transformed response
                // so OpenCode SessionRunner invokes hook("retry") to rotate accounts instead of aborting the session
                if (event.response && (event.response.status === 429 || event.response.status === 403)) {
                    const headers = new Headers(event.response.headers);
                    headers.set("x-should-retry", "true");
                    event.response = new Response(event.response.body, {
                        status: event.response.status,
                        statusText: event.response.statusText,
                        headers,
                    });
                }
            }
            catch (error) {
                log.warn(`Response transform error in v2 adapter: ${error}`);
            }
            finally {
                if (!event.response?.ok && meta) {
                    lastFailedMetaBySession.set(sessionKey, meta);
                }
            }
        });
        // Native retry hook: fast failover to next account on HTTP 429, 403,
        // or transport failures (Decode error / truncated SSE streams).
        await context.session.hook("retry", async (event) => {
            const status = event.error?.status;
            const message = (event.error?.message || "").toLowerCase();
            const isRotatable = status === 429 ||
                status === 403 ||
                message.includes("decode") ||
                message.includes("stream") ||
                message.includes("eof") ||
                message.includes("econnreset") ||
                message.includes("socket connection was closed") ||
                message.includes("quota exceeded");
            const sessionKey = event.sessionID ?? "default";
            let meta = lastFailedMetaBySession.get(sessionKey);
            lastFailedMetaBySession.delete(sessionKey);
            if (!meta) {
                const pending = dequeuePending(sessionKey);
                if (pending?.family !== undefined && pending?.accountIndex !== undefined) {
                    meta = { family: pending.family, accountIndex: pending.accountIndex };
                }
            }
            if (!isRotatable)
                return;
            const storage = await loadAccounts();
            if (!storage || storage.accounts.length <= 1)
                return;
            const family = meta?.family ?? "claude";
            const prevIndex = meta?.accountIndex ?? storage.activeIndex ?? 0;
            const nextIndex = (prevIndex + 1) % storage.accounts.length;
            storage.activeIndex = nextIndex;
            await saveAccounts(storage).catch(() => { });
            try {
                // Advance the shared manager's cursor for this family so the next
                // request for the same model family lands on the healthy account.
                const mgr = await getSharedAccountManager();
                if (status === 429 || status === 403) {
                    // Put the failed account on a temporary cooldown for this family
                    mgr.markRateLimitedByIndex(prevIndex, 60_000, family, "antigravity");
                }
                mgr.getCurrentOrNextForFamily(family, null, "round-robin", "antigravity", false, 100);
            }
            catch {
                // Manager resync failure is non-fatal; storage.activeIndex already moved
            }
            log.info(`[v2 routing] Failover rotate idx ${prevIndex} -> ${nextIndex} for family=${family} (status=${status ?? "transport"})`);
            event.decision = { retry: true, delay: 500 };
        });
    }
    // 1.5 Integration registration: exposes the Antigravity Google OAuth method in
    // OpenCode v2 (`opencode auth login` / TUI connect) and persists every newly
    // authorized account into the plugin's multi-account pool so rotation picks it up.
    if (context.integration && typeof context.integration.transform === "function") {
        await context.integration.transform((editor) => {
            // Ensure the integration is present and human-readable before adding methods.
            editor.update("google", (integration) => {
                if (!integration.name)
                    integration.name = "Google";
            });
            editor.method.update({
                integrationID: "google",
                method: {
                    id: "antigravity-oauth",
                    type: "oauth",
                    label: "OAuth with Google (Antigravity)",
                },
                authorize: async () => {
                    const authorization = await authorizeAntigravity("");
                    // Capture state (PKCE verifier + project id) so the code callback is stateless.
                    let capturedState = "";
                    try {
                        capturedState = new URL(authorization.url).searchParams.get("state") ?? "";
                    }
                    catch {
                        capturedState = "";
                    }
                    return {
                        mode: "code",
                        url: authorization.url,
                        instructions: "Sign in with Google, approve Antigravity access, then paste the full redirected localhost URL (or just the authorization code).",
                        callback: async (input) => {
                            let code = (input ?? "").trim();
                            let state = capturedState;
                            try {
                                const parsed = new URL(code);
                                code = parsed.searchParams.get("code") ?? code;
                                state = parsed.searchParams.get("state") ?? state;
                            }
                            catch {
                                // Raw code pasted without the redirect URL is fine.
                            }
                            if (!code) {
                                throw new Error("Missing authorization code");
                            }
                            if (!state) {
                                throw new Error("Missing OAuth state; paste the full redirect URL instead of only the code.");
                            }
                            const result = await exchangeAntigravity(code, state);
                            if (result.type !== "success") {
                                let detail = result.error || "Antigravity token exchange failed";
                                try {
                                    const parsed = JSON.parse(detail);
                                    detail = parsed.error_description || parsed.error || detail;
                                }
                                catch {
                                    // keep raw text
                                }
                                throw new Error(detail);
                            }
                            // Merge into the multi-account pool used by the v2 rotation engine.
                            await persistAccountPool([result], false).catch((e) => {
                                log.warn(`Failed to persist Antigravity account: ${e instanceof Error ? e.message : String(e)}`);
                            });
                            const parts = parseRefreshParts(result.refresh);
                            return {
                                type: "oauth",
                                methodID: "antigravity-oauth",
                                refresh: formatRefreshParts(parts),
                                access: result.access,
                                expires: result.expires,
                                metadata: {
                                    ...(result.email ? { email: result.email } : {}),
                                    ...(result.projectId ? { projectId: result.projectId } : {}),
                                },
                            };
                        },
                    };
                },
                refresh: async (credential) => {
                    const parts = parseRefreshParts(credential?.refresh ?? "");
                    if (!parts.refreshToken) {
                        throw new Error("Missing refresh token for Antigravity credential");
                    }
                    const mockAuth = {
                        type: "oauth",
                        refresh: formatRefreshParts(parts),
                        access: credential?.access ?? "",
                        expires: typeof credential?.expires === "number" ? credential.expires : 0,
                    };
                    const refreshed = await refreshAccessToken(mockAuth, MOCK_CLIENT, ANTIGRAVITY_PROVIDER_ID);
                    if (!refreshed?.access) {
                        throw new Error("Failed to refresh Antigravity access token");
                    }
                    return {
                        ...credential,
                        access: refreshed.access,
                        expires: refreshed.expires ?? credential.expires,
                        refresh: refreshed.refresh ?? credential.refresh,
                    };
                },
                label: (credential) => typeof credential?.metadata?.email === "string" ? credential.metadata.email : undefined,
            });
        });
    }
    // 1.6 Optional dynamic model discovery (config: `model_discovery`).
    // Asks the backend which models the active account actually has, so models this
    // plugin has not curated (for example the Gemini 4 "Argon" line) are registered
    // for the accounts that own them. Best-effort: any failure keeps the curated
    // catalog, and a failed startup must never break the provider.
    let discoveredModels = {};
    if (config.model_discovery) {
        try {
            const storage = await loadAccounts();
            const account = storage?.accounts?.[storage.activeIndex ?? 0] ?? storage?.accounts?.[0];
            if (account?.refreshToken) {
                const accessToken = await getAccessToken(account);
                if (accessToken) {
                    discoveredModels = await collectDiscoveredModels(accessToken, account.managedProjectId || account.projectId);
                }
            }
        }
        catch (error) {
            log.warn(`[v2] Model discovery failed, keeping the curated catalog: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 2. Model catalog transforms in OpenCode v2.
    // The v2 ModelEditor exposes only list/get/update/remove/default/provider.
    // `update(providerID, modelID, draft => ...)` seeds `Model.Info.default`
    // when the model is absent and adds it under an available provider, which is
    // exactly what we need: the `google` provider becomes available once the
    // Antigravity OAuth integration has at least one connection (section 1.5).
    if (context.model && typeof context.model.transform === "function") {
        await context.model.transform((editor) => {
            // Curated entries win over discovered ones for the same model id.
            const catalog = { ...discoveredModels, ...OPENCODE_MODEL_DEFINITIONS };
            for (const [modelId, def] of Object.entries(catalog)) {
                try {
                    editor.update("google", modelId, (draft) => {
                        draft.name = def.name;
                        draft.enabled = true;
                        draft.status = "active";
                        draft.limit = { context: def.limit.context, output: def.limit.output };
                        draft.capabilities = {
                            tools: true,
                            input: [...def.modalities.input],
                            output: [...def.modalities.output],
                        };
                        if (def.variants) {
                            // v2 Model.Variant = { id, settings?, headers?, body? }. Thinking
                            // config rides in `settings`, which OpenCode forwards as provider
                            // options (the request transform reads providerOptions.google.*).
                            draft.variants = Object.entries(def.variants).map(([vId, vOpt]) => ({
                                id: vId,
                                settings: { ...vOpt },
                            }));
                        }
                    });
                }
                catch (error) {
                    log.warn(`[v2] Failed to register model ${modelId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            // Opt-in: keep the picker limited to the curated Antigravity catalog.
            if (config.hide_foreign_models) {
                const hidden = hideForeignModels(editor, "google", new Set(Object.keys(catalog)));
                if (hidden > 0)
                    log.info(`[v2] disabled ${hidden} non-Antigravity google models`);
            }
        });
    }
    // 3. Register tools in OpenCode v2 tool registry.
    // v2 ToolEditor.add takes a definition whose effective name is derived from
    // `name` (there is no `id` field); execute returns structured Tool.Result.
    if (context.tool && typeof context.tool.transform === "function") {
        await context.tool.transform((editor) => {
            // antigravity_quota tool
            editor.add({
                name: "antigravity_quota",
                description: "Check Antigravity quota (5h and weekly windows) across all configured Google accounts",
                input: {
                    type: "object",
                    properties: {},
                },
                execute: async () => {
                    try {
                        const report = await getQuotaReport();
                        return { content: report };
                    }
                    catch (error) {
                        const errMsg = `Error retrieving Antigravity quota: ${error instanceof Error ? error.message : String(error)}`;
                        return { content: errMsg };
                    }
                },
            });
            // google_search tool
            editor.add({
                name: "google_search",
                description: "Search the web using Google Search and analyze URLs",
                input: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query" },
                        urls: {
                            type: "array",
                            items: { type: "string" },
                            description: "List of specific URLs to fetch and analyze",
                        },
                    },
                    required: ["query"],
                },
                execute: async (args, ctx) => {
                    if (!args?.query) {
                        return { content: "Error: Search query is required." };
                    }
                    const result = await performSearch(args.query, args.urls, args.thinking, ctx?.signal);
                    return { content: result };
                },
            });
            // antigravity_stats tool
            editor.add({
                name: "antigravity_stats",
                description: "View real-time engine statistics: request counts, account health scores, rate limit tracking, and signature cache performance",
                input: {
                    type: "object",
                    properties: {},
                },
                execute: async () => {
                    try {
                        const storage = await loadAccounts();
                        const activeAcc = storage?.accounts?.[storage.activeIndex]?.email;
                        const report = EngineStatsManager.getInstance().formatStatsReport(activeAcc);
                        return { content: report };
                    }
                    catch (error) {
                        return { content: `Error retrieving Antigravity stats: ${error instanceof Error ? error.message : String(error)}` };
                    }
                },
            });
        });
    }
    // 4. Register slash commands in OpenCode v2.
    // v2 CommandDefinition.execute receives the owning session and must deliver
    // its own output (a returned string is ignored). We admit a synthetic message
    // so the report renders in the transcript without triggering a model turn.
    if (context.command && typeof context.command.transform === "function") {
        const deliver = async (sessionID, text, delivery) => {
            if (!sessionID || !context.session || typeof context.session.synthetic !== "function") {
                log.info(`[v2 command] ${text}`);
                return;
            }
            try {
                await context.session.synthetic({ sessionID, text });
            }
            catch (error) {
                log.warn(`[v2 command] Failed to deliver output: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        await context.command.transform((editor) => {
            editor.add({
                name: "antigravity-quota",
                description: "View current Antigravity API quotas across accounts",
                execute: async ({ sessionID, delivery }) => {
                    try {
                        await deliver(sessionID, await getQuotaReport(), delivery);
                    }
                    catch (error) {
                        await deliver(sessionID, `Error: ${error instanceof Error ? error.message : String(error)}`, delivery);
                    }
                },
            });
            editor.add({
                name: "antigravity-stats",
                description: "View real-time engine statistics (request counts, health scores, and signature cache)",
                execute: async ({ sessionID, delivery }) => {
                    try {
                        const storage = await loadAccounts();
                        const activeAcc = storage?.accounts?.[storage.activeIndex]?.email;
                        await deliver(sessionID, EngineStatsManager.getInstance().formatStatsReport(activeAcc), delivery);
                    }
                    catch (error) {
                        await deliver(sessionID, `Error: ${error instanceof Error ? error.message : String(error)}`, delivery);
                    }
                },
            });
            editor.add({
                name: "antigravity-setup",
                description: "Zero-config setup: auto-configures opencode.json with Antigravity models, whitelists, and commands",
                execute: async ({ sessionID, delivery }) => {
                    try {
                        const res = await updateOpencodeConfig({ writeLegacyProviderModels: false });
                        if (res.success) {
                            const storage = await loadAccounts();
                            const count = storage?.accounts?.length ?? 0;
                            const accountList = count > 0
                                ? storage.accounts.map((a, i) => `  ${i + 1}. ${a.email || "Account " + (i + 1)}`).join("\n")
                                : "  (Sin cuentas configuradas todavía - ejecuta `opencode auth login` para agregar una)";
                            const report = `Antigravity configurado con éxito en: ${res.configPath}\n\nCuentas activas (${count}):\n${accountList}\n\nModelos disponibles:\n• google/antigravity-gemini-3.8-flash (default)\n• google/antigravity-claude-sonnet-4-6\n• google/antigravity-claude-opus-4-6-thinking\n• google/antigravity-gpt-oss-120b-medium`;
                            await deliver(sessionID, report, delivery);
                        }
                        else {
                            await deliver(sessionID, `Error al configurar: ${res.error}`, delivery);
                        }
                    }
                    catch (error) {
                        await deliver(sessionID, `Error: ${error instanceof Error ? error.message : String(error)}`, delivery);
                    }
                },
            });
        });
    }
    // Return clean disposal function
    return () => {
        pendingBySession.clear();
        lastFailedMetaBySession.clear();
        log.info("Cleaning up opencode-antigravity-auth v2 adapter");
    };
}
//# sourceMappingURL=adapter.js.map