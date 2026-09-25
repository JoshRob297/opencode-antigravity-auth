/**
 * OpenCode v2 Plugin Adapter
 * 
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */

import { checkAccountsQuota, formatQuotaReportMarkdown, fetchAvailableModels, type QuotaGroup, type QuotaGroupSummary } from "../plugin/quota";
import { EngineStatsManager } from "../plugin/stats";
import { loadConfig, initRuntimeConfig } from "../plugin/config";
import { loadAccounts, saveAccounts, type ModelFamily } from "../plugin/storage";
import { AccountManager, computeSoftQuotaCacheTtlMs } from "../plugin/accounts";
import { refreshAccessToken } from "../plugin/token";
import { executeSearch } from "../plugin/search";
import { createLogger } from "../plugin/logger";
import { ANTIGRAVITY_PROVIDER_ID } from "../constants";
import {
  prepareAntigravityRequest,
  transformAntigravityResponse,
  isGenerativeLanguageRequest,
} from "../plugin/request";
import { OPENCODE_MODEL_DEFINITIONS } from "../plugin/config/models";

const log = createLogger("v2-adapter");

function resolveFamilyFromRequest(url: string, bodyText: string): { family: ModelFamily; modelName?: string } {
  let modelName = "";
  try {
    const json = JSON.parse(bodyText);
    if (typeof json.model === "string") {
      modelName = json.model;
    }
  } catch {
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
let sharedAccountManagerPromise: Promise<AccountManager> | null = null;
let quotaRefreshInFlight: Promise<void> | null = null;

function getSharedAccountManager(): Promise<AccountManager> {
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
async function refreshQuotaCacheForFamily(manager: AccountManager, family: ModelFamily): Promise<void> {
  if (quotaRefreshInFlight) {
    await quotaRefreshInFlight;
    return;
  }

  const ttlMs = computeSoftQuotaCacheTtlMs("auto", 15);
  const snapshot = manager.getAccountsSnapshot();
  const now = Date.now();
  const stale = snapshot.some(
    (a) => a.enabled !== false && (a.cachedQuotaUpdatedAt == null || now - a.cachedQuotaUpdatedAt > ttlMs),
  );
  if (!stale) return;

  const refresh = (async () => {
    const mockClient: any = { tui: { showToast: async () => {} } };
    const active = snapshot.filter((a) => a.enabled !== false);

    const results = await Promise.all(
      active.map(async (acc) => {
        try {
          const mockAuth: any = {
            type: "oauth",
            refresh: acc.parts.refreshToken,
            access: "",
            expires: 0,
          };
          const refreshed = await refreshAccessToken(mockAuth, mockClient, ANTIGRAVITY_PROVIDER_ID);
          if (!refreshed?.access) return null;
          const projectId = acc.parts.managedProjectId || acc.parts.projectId || "default-cli-project";
          const resp = await fetchAvailableModels(refreshed.access, projectId);
          return { index: acc.index, models: (resp.models || {}) as Record<string, any> };
        } catch (e) {
          log.warn(`[quota refresh] failed for ${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        }
      }),
    );

    for (const r of results) {
      if (!r) continue;

      let minClaude = Infinity;
      let resetClaude: string | undefined;
      let minFlash = Infinity;
      let resetFlash: string | undefined;
      let minPro = Infinity;
      let resetPro: string | undefined;

      for (const [key, m] of Object.entries(r.models)) {
        const qi = m?.quotaInfo;
        if (!qi || typeof qi.remainingFraction !== "number") continue;
        const frac = Math.max(0, Math.min(1, qi.remainingFraction));
        const label = (m.displayName || key || "").toLowerCase();
        if (label.includes("claude")) {
          if (frac < minClaude) { minClaude = frac; resetClaude = qi.resetTime; }
        } else if (label.includes("flash")) {
          if (frac < minFlash) { minFlash = frac; resetFlash = qi.resetTime; }
        } else if (label.includes("pro")) {
          if (frac < minPro) { minPro = frac; resetPro = qi.resetTime; }
        }
      }

      const quota: Partial<Record<QuotaGroup, QuotaGroupSummary>> = {};
      if (Number.isFinite(minClaude)) quota.claude = { remainingFraction: minClaude, resetTime: resetClaude };
      if (Number.isFinite(minFlash)) quota["gemini-flash"] = { remainingFraction: minFlash, resetTime: resetFlash };
      if (Number.isFinite(minPro)) quota["gemini-pro"] = { remainingFraction: minPro, resetTime: resetPro };
      if (Object.keys(quota).length > 0) {
        manager.updateQuotaCache(r.index, quota);
      }
    }

    // Persist the refreshed cache to disk surgically so future restarts benefit.
    try {
      const storage = await loadAccounts();
      if (!storage) return;
      const updatedSnapshot = manager.getAccountsSnapshot();
      for (const r of results) {
        if (!r) continue;
        const stored = storage.accounts[r.index];
        const snap = updatedSnapshot[r.index];
        if (stored && snap) {
          stored.cachedQuota = snap.cachedQuota;
          stored.cachedQuotaUpdatedAt = snap.cachedQuotaUpdatedAt;
        }
      }
      await saveAccounts(storage);
      log.info("[v2 routing] Quota cache refreshed from live fetchAvailableModels");
    } catch (e) {
      log.warn(`[v2 routing] Failed to persist quota cache: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();

  quotaRefreshInFlight = refresh;
  try {
    await refresh;
  } finally {
    quotaRefreshInFlight = null;
  }
}

export interface V2Context {
  readonly app?: any;
  readonly location?: { directory?: string };
  readonly session?: {
    hook: (name: string, callback: (event: any) => Promise<void> | void, options?: any) => Promise<{ dispose: () => Promise<void> }>;
  };
  readonly model?: {
    transform: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
  };
  readonly tool?: {
    transform: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
  };
  readonly command?: {
    transform: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
  };
  readonly provider?: {
    transform: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
  };
  readonly integration?: {
    transform: (callback: (editor: any) => void) => Promise<{ dispose: () => Promise<void> }>;
  };
}

export type CleanupFunction = () => Promise<void> | void;

async function getQuotaReport(): Promise<string> {
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    return "No Antigravity accounts configured.";
  }
  const mockClient: any = { tui: { showToast: async () => {} } };
  const quotaResults = await checkAccountsQuota(storage.accounts, mockClient, ANTIGRAVITY_PROVIDER_ID);
  return formatQuotaReportMarkdown(quotaResults);
}

async function performSearch(
  query: string,
  urls?: string[],
  thinking = true,
  signal?: AbortSignal,
): Promise<string> {
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
  const mockAuth: any = {
    type: "oauth",
    refresh: primary.refreshToken,
    access: "",
    expires: 0,
  };
  const mockClient: any = { tui: { showToast: async () => {} } };

  try {
    const refreshed = await refreshAccessToken(mockAuth, mockClient, ANTIGRAVITY_PROVIDER_ID);
    if (!refreshed?.access) {
      return "Error: Failed to obtain access token for search.";
    }
    return await executeSearch(
      { query, urls, thinking },
      refreshed.access,
      projectId,
      signal,
    );
  } catch (error) {
    return `Search error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * OpenCode v2 setup hook.
 * Called automatically by the v2 plugin supervisor during startup.
 */
export async function setupV2(context: V2Context): Promise<CleanupFunction | void> {
  const directory = context.location?.directory || process.cwd();
  const config = loadConfig(directory);
  initRuntimeConfig(config);

  log.info("Initializing opencode-antigravity-auth in OpenCode v2 mode");

  const pendingRequests = new Map<string, any>();
  const pendingFamily = new Map<string, { family: ModelFamily; accountIndex: number }>();

  // 1. Session hooks: Native HTTP request/response pipeline and multi-account retry
  if (context.session && typeof context.session.hook === "function") {
    // Intercept outbound HTTP requests to Google Cloud Code
    await context.session.hook("http.request", async (event: any) => {
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
      } catch {
        bodyText = "";
      }

      const { family, modelName } = resolveFamilyFromRequest(url, bodyText);

      // Multi-account rotation via AccountManager (shared singleton keeps quota cache warm)
      let accountManager: AccountManager | null = null;
      try {
        accountManager = await getSharedAccountManager();
        await refreshQuotaCacheForFamily(accountManager, family);
      } catch (err) {
        log.warn(`Failed to initialize AccountManager in v2 adapter: ${err}`);
      }

      let selectedAccount: any = null;
      if (accountManager && accountManager.getAccountCount() > 0) {
        const strategy = config.account_selection_strategy || "hybrid";
        selectedAccount = accountManager.getCurrentOrNextForFamily(
          family,
          modelName,
          strategy,
          "antigravity",
          config.pid_offset_enabled,
          config.soft_quota_threshold_percent,
        );
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
        await saveAccounts(storage).catch(() => {});
      }

      log.info(`[v2 routing] Selected account idx=${activeIndex} (${account.email || "unknown"}) for family=${family} model=${modelName || "default"}`);

      const mockAuth: any = {
        type: "oauth",
        refresh: account.refreshToken,
        access: "",
        expires: 0,
      };
      const mockClient: any = { tui: { showToast: async () => {} } };
      let accessToken = "";
      try {
        const refreshed = await refreshAccessToken(mockAuth, mockClient, ANTIGRAVITY_PROVIDER_ID);
        accessToken = refreshed?.access || "";
      } catch (err) {
        log.warn(`Token refresh error in v2 adapter: ${err}`);
      }

      const headers = new Headers(event.request.headers);
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      const prepared = prepareAntigravityRequest(
        url,
        {
          method: event.request.method,
          headers,
          body: bodyText,
        },
        accessToken,
        account.managedProjectId || account.projectId || "default-cli-project",
        undefined,
        "antigravity",
      );

      pendingRequests.set(event.sessionID, prepared);
      pendingFamily.set(event.sessionID, { family, accountIndex: activeIndex });

      event.request = new Request(prepared.request, prepared.init);
    });

    // Transform inbound SSE responses and extract thinking tokens
    await context.session.hook("http.response", async (event: any) => {
      const prepared = pendingRequests.get(event.sessionID);
      if (!prepared) {
        return;
      }

      // Mark account as used on response arrival
      const meta = pendingFamily.get(event.sessionID);
      if (meta !== undefined && event.response?.ok) {
        try {
          const mgr = await getSharedAccountManager();
          mgr.markAccountUsed(meta.accountIndex);
        } catch {
          // ignore
        }
      }

      try {
        const transformed = await transformAntigravityResponse(
          event.response,
          prepared.streaming,
          null,
          prepared.requestedModel,
          prepared.projectId,
          prepared.endpoint,
          prepared.effectiveModel,
          prepared.sessionId,
          prepared.toolDebugMissing,
          prepared.toolDebugSummary,
          prepared.toolDebugPayload,
          undefined,
          async (ratings) => {
            if (!config.safety_shield?.enabled) return;
            const highRisk = ratings.filter(
              (r) => r.probability === "HIGH" || r.probability === "MEDIUM"
            );
            if (highRisk.length === 0) return;

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
                await saveAccounts(storage);
                log.warn(`[Safety Shield] High risk threshold reached. Preventive rotation to account index ${nextIndex}`);
              }
            }
          },
        );
        event.response = transformed;
      } catch (error) {
        log.warn(`Response transform error in v2 adapter: ${error}`);
      } finally {
        pendingRequests.delete(event.sessionID);
        pendingFamily.delete(event.sessionID);
      }
    });

    // Native retry hook: fast failover to next account on HTTP 429, 403,
    // or transport failures (Decode error / truncated SSE streams).
    await context.session.hook("retry", async (event: any) => {
      const status = event.error?.status;
      const message = (event.error?.message || "").toLowerCase();

      const isRotatable =
        status === 429 ||
        status === 403 ||
        message.includes("decode") ||
        message.includes("stream") ||
        message.includes("eof") ||
        message.includes("quota exceeded");

      if (!isRotatable) return;

      const storage = await loadAccounts();
      if (!storage || storage.accounts.length <= 1) return;

      const meta = pendingFamily.get(event.sessionID);
      const family: ModelFamily = meta?.family ?? "claude";
      const prevIndex = meta?.accountIndex ?? storage.activeIndex ?? 0;
      const nextIndex = (prevIndex + 1) % storage.accounts.length;

      storage.activeIndex = nextIndex;
      await saveAccounts(storage).catch(() => {});

      try {
        // Advance the shared manager's cursor for this family so the next
        // request for the same model family lands on the healthy account.
        const mgr = await getSharedAccountManager();
        const prevAcc = mgr.getAccountsSnapshot()[prevIndex];
        if (prevAcc && (status === 429 || status === 403)) {
          // Put the failed account on a temporary cooldown for this family
          mgr.markRateLimited(prevAcc, 60_000, family, "antigravity");
        }
        mgr.getCurrentOrNextForFamily(
          family,
          null,
          "round-robin",
          "antigravity",
          false,
          100,
        );
      } catch {
        // Manager resync failure is non-fatal; storage.activeIndex already moved
      }

      log.info(`[v2 routing] Failover rotate idx ${prevIndex} -> ${nextIndex} for family=${family} (status=${status ?? "transport"})`);
      event.decision = { retry: true, delay: 500 };
    });
  }

  // 2. Model catalog transforms in OpenCode v2
  if (context.model && typeof context.model.transform === "function") {
    await context.model.transform((editor: any) => {
      for (const [modelId, def] of Object.entries(OPENCODE_MODEL_DEFINITIONS)) {
        try {
          editor.update("google", modelId, (draft: any) => {
            draft.name = def.name;
            draft.limit = def.limit;
            draft.status = "active";
            if (def.variants) {
              draft.variants = Object.entries(def.variants).map(([vId, vOpt]) => ({
                id: vId,
                ...vOpt,
              }));
            }
          });
        } catch {
          // Model might not be pre-seeded in current candidate list; safe to ignore
        }
      }
    });
  }

  // 3. Register tools in OpenCode v2 tool registry
  if (context.tool && typeof context.tool.transform === "function") {
    await context.tool.transform((editor: any) => {
      // antigravity_quota tool
      editor.add({
        id: "antigravity_quota",
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
          } catch (error) {
            const errMsg = `Error retrieving Antigravity quota: ${error instanceof Error ? error.message : String(error)}`;
            return { content: errMsg };
          }
        },
      });

      // google_search tool
      editor.add({
        id: "google_search",
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
        execute: async (args: { query?: string; urls?: string[]; thinking?: boolean }, ctx?: { signal?: AbortSignal }) => {
          if (!args?.query) {
            return { content: "Error: Search query is required." };
          }
          const result = await performSearch(args.query, args.urls, args.thinking, ctx?.signal);
          return { content: result };
        },
      });

      // antigravity_stats tool
      editor.add({
        id: "antigravity_stats",
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
          } catch (error) {
            return { content: `Error retrieving Antigravity stats: ${error instanceof Error ? error.message : String(error)}` };
          }
        },
      });
    });
  }

  // 4. Register slash commands in OpenCode v2
  if (context.command && typeof context.command.transform === "function") {
    await context.command.transform((editor: any) => {
      editor.add({
        name: "antigravity-quota",
        description: "View current Antigravity API quotas across accounts",
        execute: async () => {
          try {
            return await getQuotaReport();
          } catch (error) {
            return `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      });

      editor.add({
        name: "antigravity-stats",
        description: "View real-time engine statistics (request counts, health scores, and signature cache)",
        execute: async () => {
          try {
            const storage = await loadAccounts();
            const activeAcc = storage?.accounts?.[storage.activeIndex]?.email;
            return EngineStatsManager.getInstance().formatStatsReport(activeAcc);
          } catch (error) {
            return `Error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      });
    });
  }

  // Return clean disposal function
  return () => {
    pendingRequests.clear();
    log.info("Cleaning up opencode-antigravity-auth v2 adapter");
  };
}
