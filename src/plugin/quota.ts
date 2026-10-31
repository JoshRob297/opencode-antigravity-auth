import {
  ANTIGRAVITY_ENDPOINT_PROD,
  getAntigravityHeaders,
  getAntigravityCliUserAgent,
  ANTIGRAVITY_PROVIDER_ID,
} from "../constants";
import { accessTokenExpired, formatRefreshParts, parseRefreshParts } from "./auth";
import { logQuotaFetch } from "./debug";
import { ensureProjectContext } from "./project";
import { refreshAccessToken } from "./token";
import type { PluginClient, OAuthAuthDetails } from "./types";
import type { AccountMetadataV3, AccountModelCatalog } from "./storage";
import { EngineStatsManager } from "./stats";

const FETCH_TIMEOUT_MS = 10000;

export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash";

export interface QuotaGroupSummary {
  remainingFraction?: number;
  resetTime?: string;
  modelCount?: number;
}

export interface BucketQuotaDisplay {
  window: "5h" | "weekly" | string;
  displayName: string;
  remainingPercentage: number;
  remainingFraction: number;
  resetTime: Date;
  /** Absolute reset as the backend reported it, in UTC (`2026-11-07 01:37Z`). */
  resetTimeDisplay: string;
  timeUntilReset: number;
  timeUntilResetFormatted: string;
}

export interface GroupQuotaDisplay {
  displayName: string;
  description?: string;
  fiveHour?: BucketQuotaDisplay;
  weekly?: BucketQuotaDisplay;
}

export interface ModelQuotaDisplay {
  label: string;
  modelId: string;
  remainingPercentage: number;
  remainingFraction: number;
  isExhausted: boolean;
  resetTime: Date;
  resetTimeDisplay: string;
  timeUntilReset: number;
  timeUntilResetFormatted: string;
  recommended?: boolean;
  tagTitle?: string;
}

export type AccountQuotaStatus = "ok" | "disabled" | "error";

export interface AccountQuotaResult {
  index: number;
  email?: string;
  status: AccountQuotaStatus;
  error?: string;
  disabled?: boolean;
  groups?: GroupQuotaDisplay[];
  models?: ModelQuotaDisplay[];
  cachedQuota?: Partial<Record<QuotaGroup, QuotaGroupSummary>>;
  /** Measured per-account model catalog, used to report entitlements. */
  modelCatalog?: AccountModelCatalog;
  updatedAccount?: AccountMetadataV3;
}

export interface CloudCodeQuotaSummaryResponse {
  groups?: {
    displayName?: string;
    description?: string;
    buckets?: {
      bucketId?: string;
      displayName?: string;
      window?: string;
      resetTime?: string;
      description?: string;
      remainingFraction?: number;
    }[];
  }[];
  description?: string;
}

export interface FetchAvailableModelsResponse {
  models?: Record<
    string,
    {
      displayName?: string;
      model?: string;
      modelName?: string;
      quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
      };
      supportsImages?: boolean;
      supportsVideo?: boolean;
      supportsThinking?: boolean;
      recommended?: boolean;
      tagTitle?: string;
    }
  >;
}

export function formatDuration(ms: number): string {
  const absMs = Math.abs(ms);
  const seconds = Math.floor(absMs / 1000);
  const d = Math.floor(seconds / (24 * 3600));
  const h = Math.floor((seconds % (24 * 3600)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function shortEmail(email: string): string {
  return email.split("@")[0] || email;
}

export function progressBar(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${clamped.toFixed(0)}%`;
}

/**
 * Absolute reset stamp in UTC as the backend reports it, e.g. `2026-11-07 01:37Z`.
 * The dual-window buckets are days apart, so "in 6d 23h" alone cannot be acted on.
 */
export function formatResetStamp(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "unknown";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

function buildAuthFromAccount(account: AccountMetadataV3): OAuthAuthDetails {
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

function normalizeRemainingFraction(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchQuotaSummary(
  accessToken: string,
  projectId?: string,
): Promise<CloudCodeQuotaSummaryResponse> {
  const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
  const antigravityHeaders = getAntigravityHeaders();
  const body = projectId ? { project: projectId } : {};

  const response = await fetchWithTimeout(`${endpoint}/v1internal:retrieveUserQuotaSummary`, {
    method: "POST",
    headers: {
      ...antigravityHeaders,
      "User-Agent": getAntigravityCliUserAgent(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`retrieveUserQuotaSummary failed (${response.status})`);
  }

  return (await response.json()) as CloudCodeQuotaSummaryResponse;
}

export async function fetchAvailableModels(
  accessToken: string,
  projectId?: string,
): Promise<FetchAvailableModelsResponse> {
  const endpoint = ANTIGRAVITY_ENDPOINT_PROD;
  const antigravityHeaders = getAntigravityHeaders();
  const body = projectId ? { project: projectId } : {};

  const response = await fetchWithTimeout(`${endpoint}/v1internal:fetchAvailableModels`, {
    method: "POST",
    headers: {
      ...antigravityHeaders,
      "User-Agent": getAntigravityCliUserAgent(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`fetchAvailableModels failed (${response.status})`);
  }

  return (await response.json()) as FetchAvailableModelsResponse;
}

function applyAccountUpdates(account: AccountMetadataV3, auth: OAuthAuthDetails): AccountMetadataV3 | undefined {
  const parts = parseRefreshParts(auth.refresh);
  if (!parts.refreshToken) {
    return undefined;
  }

  const updated: AccountMetadataV3 = {
    ...account,
    refreshToken: parts.refreshToken,
    projectId: parts.projectId ?? account.projectId,
    managedProjectId: parts.managedProjectId ?? account.managedProjectId,
  };

  const changed =
    updated.refreshToken !== account.refreshToken ||
    updated.projectId !== account.projectId ||
    updated.managedProjectId !== account.managedProjectId;

  return changed ? updated : undefined;
}

export async function fetchAccountQuotaDetails(
  account: AccountMetadataV3,
  index: number,
  client: PluginClient,
  providerId = ANTIGRAVITY_PROVIDER_ID,
): Promise<AccountQuotaResult> {
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
    const groups: GroupQuotaDisplay[] = [];

    for (const group of summaryResponse.groups) {
      const groupDisplay: GroupQuotaDisplay = {
        displayName: group.displayName || "Unknown Group",
        description: group.description,
      };

      for (const bucket of group.buckets || []) {
        const fraction = normalizeRemainingFraction(bucket.remainingFraction);
        let resetTime: Date;
        if (bucket.resetTime) {
          const parsed = new Date(bucket.resetTime);
          resetTime = Number.isNaN(parsed.getTime()) ? new Date(now + 86400000) : parsed;
        } else {
          resetTime = new Date(now + 86400000);
        }
        const timeUntilReset = Math.max(0, resetTime.getTime() - now);

        const bucketDisplay: BucketQuotaDisplay = {
          window: bucket.window || bucket.bucketId || "unknown",
          displayName: bucket.displayName || bucket.bucketId || "Limit",
          remainingPercentage: Math.round(fraction * 100),
          remainingFraction: fraction,
          resetTime,
          resetTimeDisplay: formatResetStamp(resetTime),
          timeUntilReset,
          timeUntilResetFormatted: formatDuration(timeUntilReset),
        };

        const windowKey = (bucket.window || bucket.bucketId || "").toLowerCase();
        if (windowKey.includes("5h")) {
          groupDisplay.fiveHour = bucketDisplay;
        } else if (windowKey.includes("week")) {
          groupDisplay.weekly = bucketDisplay;
        }
      }

      groups.push(groupDisplay);
    }

        const cachedQuota: Partial<Record<QuotaGroup, QuotaGroupSummary>> = {};
        for (const g of groups) {
          const groupName = g.displayName.toLowerCase();
          const bucket = g.fiveHour || g.weekly;
          if (bucket) {
            if (groupName.includes("claude") || groupName.includes("gpt")) {
              cachedQuota.claude = {
                remainingFraction: bucket.remainingFraction,
                resetTime: bucket.resetTime.toISOString(),
              };
            } else if (groupName.includes("gemini")) {
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
          modelCatalog: account.modelCatalog,
          updatedAccount,
        };
      }
    } catch {
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
        modelCatalog: account.modelCatalog,
        updatedAccount,
      };
    }

    const models: ModelQuotaDisplay[] = [];
    for (const [modelKey, info] of Object.entries(quotaResponse.models)) {
      const quotaInfo = info.quotaInfo;
      if (!quotaInfo) continue;

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
      let resetTime: Date;
      if (quotaInfo.resetTime) {
        const parsed = new Date(quotaInfo.resetTime);
        resetTime = Number.isNaN(parsed.getTime()) ? new Date(now + 86400000) : parsed;
      } else {
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

    // Synthesize dual groups from models fallback so formatQuotaReportMarkdown renders them in the dual-window report
    const groups: GroupQuotaDisplay[] = [];
    const claudeModels = Object.values(quotaResponse.models).filter((m) =>
      (m.displayName || m.model || "").toLowerCase().includes("claude")
    );
    const geminiModels = Object.values(quotaResponse.models).filter((m) =>
      (m.displayName || m.model || "").toLowerCase().includes("gemini")
    );

    const buildSynthesizedGroup = (displayName: string, modelList: any[]): GroupQuotaDisplay => {
      let minFraction = 1.0;
      let resetTime = new Date(now + 86400000);
      for (const m of modelList) {
        if (m.quotaInfo?.remainingFraction !== undefined) {
          const f = normalizeRemainingFraction(m.quotaInfo.remainingFraction);
          if (f < minFraction) minFraction = f;
        }
        if (m.quotaInfo?.resetTime) {
          const p = new Date(m.quotaInfo.resetTime);
          if (!Number.isNaN(p.getTime())) resetTime = p;
        }
      }
      const timeUntilReset = Math.max(0, resetTime.getTime() - now);
      const bucket: BucketQuotaDisplay = {
        window: "5h",
        displayName: "Limit Remaining",
        remainingPercentage: Math.round(minFraction * 100),
        remainingFraction: minFraction,
        resetTime,
        resetTimeDisplay: formatResetStamp(resetTime),
        timeUntilReset,
        timeUntilResetFormatted: formatDuration(timeUntilReset),
      };
      return {
        displayName,
        fiveHour: bucket,
        weekly: bucket,
      };
    };

    if (claudeModels.length > 0) {
      groups.push(buildSynthesizedGroup("Claude and GPT models", claudeModels));
    }
    if (geminiModels.length > 0) {
      groups.push(buildSynthesizedGroup("Gemini Models", geminiModels));
    }

    const cachedQuota: Partial<Record<QuotaGroup, QuotaGroupSummary>> = {};
    for (const m of models) {
      const lower = m.label.toLowerCase();
      if (lower.includes("claude")) {
        cachedQuota.claude = {
          remainingFraction: m.remainingFraction,
          resetTime: m.resetTime.toISOString(),
        };
      } else if (lower.includes("pro")) {
        cachedQuota["gemini-pro"] = {
          remainingFraction: m.remainingFraction,
          resetTime: m.resetTime.toISOString(),
        };
      } else if (lower.includes("flash")) {
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
      groups: groups.length > 0 ? groups : undefined,
      models,
      cachedQuota,
      modelCatalog: account.modelCatalog,
      updatedAccount,
    };
  } catch (error) {
    return {
      index,
      email: account.email,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      disabled,
    };
  }
}

export async function checkAccountsQuota(
  accounts: AccountMetadataV3[],
  client: PluginClient,
  providerId = ANTIGRAVITY_PROVIDER_ID,
): Promise<AccountQuotaResult[]> {
  const results: AccountQuotaResult[] = [];
  logQuotaFetch("start", accounts.length);

  for (const [index, account] of accounts.entries()) {
    results.push(await fetchAccountQuotaDetails(account, index, client, providerId));
  }

  return results;
}

type QuotaGroupKind = "argon" | "gemini" | "claude" | "other";

function classifyQuotaGroup(displayName: string): QuotaGroupKind {
  const lower = displayName.toLowerCase();
  // Argon has its own weekly bucket (`gemini-argon-wtu-weekly`); it must not be
  // folded into the Gemini Flash/Pro group, which is what a plain
  // `includes("gemini")` check used to do.
  if (lower.includes("argon")) return "argon";
  if (lower.includes("claude") || lower.includes("gpt")) return "claude";
  if (lower.includes("gemini")) return "gemini";
  return "other";
}

const GROUP_TITLES: Record<QuotaGroupKind, string> = {
  argon: "Gemini 4 Argon (own weekly bucket)",
  gemini: "Gemini Models (Flash / Pro)",
  claude: "Claude & GPT Models (Opus / Sonnet / GPT-OSS)",
  other: "Other models",
};

const GROUP_ORDER: QuotaGroupKind[] = ["argon", "gemini", "claude", "other"];

/** `[bar] 99%` + absolute reset stamp + relative countdown, padded for a table. */
function formatBucketCells(bucket: BucketQuotaDisplay | undefined): { quota: string; reset: string } {
  if (!bucket) return { quota: "N/A".padEnd(18, " "), reset: "-".padEnd(30, " ") };
  const quota = progressBar(bucket.remainingPercentage).padEnd(18, " ");
  const reset = `${bucket.resetTimeDisplay} (${bucket.timeUntilResetFormatted})`.padEnd(30, " ");
  return { quota, reset };
}

interface CatalogSummary {
  measured: boolean;
  modelCount: number;
  argon?: { remainingFraction?: number; resetTime?: string };
  claude55: boolean;
  flash38: boolean;
}

function summarizeCatalog(catalog: AccountModelCatalog | undefined): CatalogSummary {
  const ids = catalog?.models ? Object.keys(catalog.models) : [];
  const summary: CatalogSummary = { measured: ids.length > 0, modelCount: ids.length, claude55: false, flash38: false };
  if (ids.length === 0) return summary;

  let bestArgon: { remainingFraction?: number; resetTime?: string } | undefined;
  for (const id of ids) {
    if (id.startsWith("gemini-4-argon")) {
      const entry = catalog!.models[id]!;
      if (!bestArgon || (entry.remainingFraction ?? 0) > (bestArgon.remainingFraction ?? 0)) {
        bestArgon = { remainingFraction: entry.remainingFraction, resetTime: entry.resetTime };
      }
    }
    if (/^claude-(sonnet|opus)-5-5/.test(id)) summary.claude55 = true;
    if (/^gemini-3\.8-flash/.test(id)) summary.flash38 = true;
  }
  summary.argon = bestArgon;
  return summary;
}

function formatArgonCell(summary: CatalogSummary): string {
  if (!summary.measured) return "not measured";
  if (!summary.argon) return "no";
  const remaining = summary.argon.remainingFraction;
  const reset = summary.argon.resetTime ? formatResetStamp(new Date(summary.argon.resetTime)) : "no reset";
  if (typeof remaining !== "number") return `yes · ${reset}`;
  return `yes ${Math.round(remaining * 100)}% · ${reset}`;
}

/**
 * Renders the quota report.
 *
 * Uses the per-account shape the backend actually returns now: one group per
 * model family (Gemini Flash/Pro, Claude/GPT and the standalone `Gemini 4 Argon`
 * bucket), each with its own 5h/weekly windows, plus the reset timestamps the
 * backend declares (absolute and relative) and the measured model catalog of
 * every account.
 */
export function formatQuotaReportMarkdown(results: AccountQuotaResult[]): string {
  if (results.length === 0) {
    return "# Antigravity Quota Status\n\nNo accounts configured.\n";
  }

  let output = "# Antigravity Quota Status\n";
  const errors: string[] = [];
  const hasGroups = results.some((r) => r.status !== "error" && r.groups && r.groups.length > 0);

  const byKind = new Map<QuotaGroupKind, AccountQuotaResult[]>();
  for (const result of results) {
    if (result.status === "error") {
      errors.push(`${shortEmail(result.email || `Account ${result.index + 1}`)}: ${result.error || "error"}`);
      continue;
    }
    if (!result.groups) continue;
    const kinds = new Set<QuotaGroupKind>();
    for (const g of result.groups) {
      kinds.add(classifyQuotaGroup(g.displayName));
    }
    for (const kind of kinds) {
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(result);
    }
  }

  if (errors.length > 0) {
    output += `\n**Errors:** ${errors.join(", ")}\n`;
  }

  if (hasGroups) {
    const friendly: Record<string, string> = {};
    for (const result of results) {
      if (result.email) friendly[result.email] = shortEmail(result.email);
    }

    for (const kind of GROUP_ORDER) {
      const accounts = byKind.get(kind);
      if (!accounts || accounts.length === 0) continue;

      // Argon only has a weekly bucket; printing empty 5h columns for it is noise.
      const groupOf = (result: AccountQuotaResult) =>
        (result.groups || []).find((g) => classifyQuotaGroup(g.displayName) === kind);
      const showFiveHour = accounts.some((result) => groupOf(result)?.fiveHour);
      const showWeekly = accounts.some((result) => groupOf(result)?.weekly);

      output += `\n## ${GROUP_TITLES[kind]}\n`;
      output += "```text\n";
      let header = "";
      if (showFiveHour) header += `${"QUOTA (5h)".padEnd(18, " ")}${"RESET (5h)".padEnd(30, " ")}`;
      if (showWeekly) header += `${"QUOTA (weekly)".padEnd(18, " ")}${"RESET (weekly)".padEnd(30, " ")}`;
      output += `${header}${"HEALTH".padEnd(8, " ")}ACCOUNT\n`;

      const rows = accounts
        .map((result) => {
          const group = groupOf(result);
          const email = result.email || `account-${result.index + 1}`;
          const health = EngineStatsManager.getInstance().getSavedHealthScore(email) ?? 100;
          const five = formatBucketCells(group?.fiveHour);
          const week = formatBucketCells(group?.weekly);
          const name = `${shortEmail(email)}${result.disabled ? " (disabled)" : ""}`;
          const weeklyPercent = group?.weekly?.remainingPercentage ?? group?.fiveHour?.remainingPercentage ?? 0;
          let line = "";
          if (showFiveHour) line += `${five.quota}${five.reset}`;
          if (showWeekly) line += `${week.quota}${week.reset}`;
          line += `${`${health}%`.padEnd(8, " ")}${name}`;
          return { line, weeklyPercent };
        })
        .sort((a, b) => b.weeklyPercent - a.weeklyPercent);

      for (const row of rows) output += `${row.line}\n`;
      output += "```\n";
    }
  } else {
    // Fallback model list format (accounts whose summary endpoint is unavailable).
    const familyMap = new Map<string, Map<string, { percentage: number; resetIn: string; disabled?: boolean }>>();

    for (const result of results) {
      if (result.status === "error" || !result.models) {
        if (result.status === "error") {
          errors.push(`${shortEmail(result.email || `Account ${result.index + 1}`)}: ${result.error || "error"}`);
        }
        continue;
      }

      for (const model of result.models) {
        const lower = model.label.toLowerCase();
        let familyName = "Gemini Models (Flash / Pro)";
        if (lower.includes("claude") || lower.includes("gpt")) {
          familyName = "Claude & GPT Models (Opus / Sonnet / GPT-OSS)";
        } else if (lower.includes("argon")) {
          familyName = "Gemini 4 Argon (own weekly bucket)";
        }

        if (!familyMap.has(familyName)) familyMap.set(familyName, new Map());
        const accountMap = familyMap.get(familyName)!;
        const accKey = result.email || `account-${result.index + 1}`;
        if (!accountMap.has(accKey)) {
          accountMap.set(accKey, {
            percentage: model.remainingPercentage,
            resetIn: `${model.resetTimeDisplay || formatResetStamp(model.resetTime)} (${model.timeUntilResetFormatted})`,
            disabled: result.disabled,
          });
        }
      }
    }

    for (const [familyName, accountMap] of Array.from(familyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      output += `\n## ${familyName}\n`;
      output += "```text\n";
      output += `${"QUOTA".padEnd(18, " ")}${"RESET".padEnd(30, " ")}ACCOUNT\n`;

      const accountsList = Array.from(accountMap.entries()).map(([email, info]) => ({ email, ...info }));
      for (const acc of accountsList.sort((a, b) => b.percentage - a.percentage)) {
        output += `${progressBar(acc.percentage).padEnd(18, " ")}${acc.resetIn.padEnd(30, " ")}${shortEmail(acc.email)}${acc.disabled ? " (disabled)" : ""}\n`;
      }
      output += "```\n";
    }
  }

  // Measured capabilities: what each account can actually reach, straight from
  // the per-account catalog discovered from `fetchAvailableModels`.
  const withCatalog = results.filter((r) => r.status !== "error");
  if (withCatalog.length > 0) {
    output += "\n## Account capabilities (measured)\n";
    output += "```text\n";
    output += `${"ACCOUNT".padEnd(28, " ")}${"MODELS".padEnd(8, " ")}${"GEMINI 4 ARGON".padEnd(34, " ")}${"CLAUDE 5.5".padEnd(12, " ")}GEMINI 3.8 FLASH\n`;
    for (const result of withCatalog) {
      const summary = summarizeCatalog(result.modelCatalog);
      const name = (result.email ? shortEmail(result.email) : `account-${result.index + 1}`).padEnd(28, " ");
      const models = String(summary.modelCount).padEnd(8, " ");
      const argon = formatArgonCell(summary).padEnd(34, " ");
      const claude = (summary.measured ? (summary.claude55 ? "yes" : "no") : "not measured").padEnd(12, " ");
      const flash = summary.measured ? (summary.flash38 ? "yes" : "no") : "not measured";
      output += `${name}${models}${argon}${claude}${flash}\n`;
    }
    output += "```\n";
    output += "\nResets are shown in UTC exactly as the backend reports them, with the countdown in parentheses.\n";
  }

  return output.trimEnd() + "\n";
}
