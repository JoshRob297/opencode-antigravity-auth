/**
 * OpenCode v2 Plugin Adapter
 * 
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */

import { checkAccountsQuota, formatQuotaReportMarkdown } from "../plugin/quota";
import { loadConfig, initRuntimeConfig } from "../plugin/config";
import { loadAccounts } from "../plugin/storage";
import { refreshAccessToken } from "../plugin/token";
import { executeSearch } from "../plugin/search";
import { createLogger } from "../plugin/logger";
import { ANTIGRAVITY_PROVIDER_ID } from "../constants";

const log = createLogger("v2-adapter");

export interface V2Context {
  readonly app?: any;
  readonly location?: { directory?: string };
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

  // 1. Register tools in OpenCode v2 tool registry
  if (context.tool && typeof context.tool.transform === "function") {
    await context.tool.transform((editor) => {
      // antigravity_quota tool
      editor.add({
        id: "antigravity_quota",
        name: "antigravity_quota",
        description: "Check Antigravity quota (5h and weekly windows) across all configured Google accounts",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          try {
            return await getQuotaReport();
          } catch (error) {
            return `Error retrieving Antigravity quota: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      });

      // google_search tool
      editor.add({
        id: "google_search",
        name: "google_search",
        description: "Search the web using Google Search and analyze URLs",
        parameters: {
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
            return "Error: Search query is required.";
          }
          return await performSearch(args.query, args.urls, args.thinking, ctx?.signal);
        },
      });
    });
  }

  // 2. Register slash commands in OpenCode v2
  if (context.command && typeof context.command.transform === "function") {
    await context.command.transform((editor) => {
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
    });
  }

  // Return clean disposal function
  return () => {
    log.info("Cleaning up opencode-antigravity-auth v2 adapter");
  };
}
