/**
 * OpenCode v2 Plugin Adapter
 * 
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */

import { checkAccountsQuota, formatQuotaReportMarkdown } from "../plugin/quota";
import { EngineStatsManager } from "../plugin/stats";
import { loadConfig, initRuntimeConfig } from "../plugin/config";
import { loadAccounts, saveAccounts } from "../plugin/storage";
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

      const activeIndex = storage.activeIndex ?? 0;
      const account = storage.accounts[activeIndex] || storage.accounts[0];
      if (!account || !account.refreshToken) {
        return;
      }

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

      let bodyText = "";
      try {
        bodyText = await event.request.clone().text();
      } catch {
        bodyText = "";
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

      event.request = new Request(prepared.request, prepared.init);
    });

    // Transform inbound SSE responses and extract thinking tokens
    await context.session.hook("http.response", async (event: any) => {
      const prepared = pendingRequests.get(event.sessionID);
      if (!prepared) {
        return;
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
      }
    });

    // Native retry hook: fast failover to next account on HTTP 429
    await context.session.hook("retry", async (event: any) => {
      if (event.error?.status === 429) {
        const storage = await loadAccounts();
        if (storage && storage.accounts.length > 1) {
          const nextIndex = ((storage.activeIndex ?? 0) + 1) % storage.accounts.length;
          storage.activeIndex = nextIndex;
          await saveAccounts(storage);
          log.info(`Rate limit encountered; rotating to account index ${nextIndex}`);
          event.decision = { retry: true, delay: 500 };
        }
      }
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
