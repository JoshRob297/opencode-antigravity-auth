import type { OpencodeModelDefinition, OpencodeModelDefinitions, ModelVariant } from "./models";
import { fetchAvailableModels } from "../quota";
import { createLogger } from "../logger";

const log = createLogger("model-discovery");

/**
 * Optional dynamic model discovery.
 *
 * The Antigravity backend returns a per-account model catalog through
 * `fetchAvailableModels`. That catalog is what an account can actually use, so
 * using it as the source of truth means new models (for example the Gemini 4
 * "Argon" line) show up for the accounts that have them, without this plugin
 * having to claim support for a model it cannot verify.
 *
 * The catalog is NOT a list of usable models, though: it also contains
 * decommissioned ids that answer with 404, ids that answer 200 with a canned
 * "no longer available" message, and internal ids that are not chat models.
 * Every entry below was measured against a real consumer account on
 * 2026-10-15 by replaying the plugin's own request envelope.
 */

/**
 * Id families that may be surfaced by discovery.
 */
export const DISCOVERY_ALLOWLIST: RegExp[] = [
  /^gemini-4[.-]/, // Gemini 4 "Argon": surfaced only for accounts that have it
  /^gemini-3\.\d+-flash/,
  /^gemini-3-flash/,
  /^gemini-2\.5-(?:flash|pro)/,
  /^claude-(?:sonnet|opus)-/,
  /^gpt-oss-/,
];

/**
 * Ids (or id families) that must never be surfaced, with the measured reason.
 */
export const DISCOVERY_DENYLIST: RegExp[] = [
  /^chat_\d+/i, // internal ids, HTTP 400
  /^tab_/i, // internal tab preview models
  /-image/i, // image output needs capabilities this catalog does not declare
  /-tiered$/i, // backend mechanic for the curated 3.8 Flash entry, not a user-facing model id
  /^gemini-3\.6-flash/i, // 404 NOT_FOUND
  /^gemini-3\.1-pro/i, // 404 NOT_FOUND
  /^gemini-pro-agent$/i, // 404 NOT_FOUND
  /^gemini-3-flash-agent$/i, // 200 + "Gemini 3.5 Flash is no longer available"
  /^gemini-3\.5-flash$/i, // 200 + canned "no longer available"
  /^gemini-3\.5-flash-(?:low|high|extra-low)$/i, // retired or 404
  /^gemini-2\.5-pro$/i, // 503 "no capacity available for model" (2026-10-15)
];

const CLAUDE_LIMIT = { context: 200000, output: 64000 };
const GPT_OSS_LIMIT = { context: 131072, output: 8192 };
const GEMINI_LIMIT = { context: 1048576, output: 65536 };

const MODALITIES = { input: ["text", "image", "pdf"] as const, output: ["text"] as const };

const GEMINI_THINKING_VARIANTS: Record<string, ModelVariant> = {
  low: { thinkingLevel: "low" },
  medium: { thinkingLevel: "medium" },
  high: { thinkingLevel: "high" },
};

const CLAUDE_THINKING_VARIANTS: Record<string, ModelVariant> = {
  low: { thinkingConfig: { thinkingBudget: 8192 } },
  medium: { thinkingConfig: { thinkingBudget: 16384 } },
  high: { thinkingConfig: { thinkingBudget: 24576 } },
  max: { thinkingConfig: { thinkingBudget: 32768 } },
};

/**
 * True when an id returned by the backend catalog may be surfaced to the user.
 */
export function isDiscoverableModelId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  const candidate = id.trim();
  if (!candidate) return false;
  if (DISCOVERY_DENYLIST.some((pattern) => pattern.test(candidate))) return false;
  return DISCOVERY_ALLOWLIST.some((pattern) => pattern.test(candidate));
}

/**
 * Human-readable label for a backend id that has no curated entry.
 */
export function displayNameForModelId(id: string): string {
  const overrides: Record<string, string> = {
    "gpt-oss-120b-medium": "GPT-OSS 120B (Medium)",
  };
  if (overrides[id]) return overrides[id]!;

  const formatted = id
    .split("-")
    .map((segment) => {
      if (/^\d+b$/i.test(segment)) return segment.toUpperCase();
      if (/^gpt$/i.test(segment) || /^oss$/i.test(segment)) return segment.toUpperCase();
      if (/^\d/.test(segment)) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");

  return `${formatted.replace(/^GPT OSS/, "GPT-OSS")} (Antigravity)`;
}

/**
 * Builds an OpenCode model definition for a discovered backend id.
 * Limits and variants are conservative: unknown families get Gemini-sized limits.
 */
export function buildDiscoveredModelDefinition(id: string): OpencodeModelDefinition {
  const lower = id.toLowerCase();
  const isClaude = lower.startsWith("claude-");
  const isGptOss = lower.startsWith("gpt-oss-");
  const isClaudeThinking = isClaude && lower.includes("thinking");

  const definition: OpencodeModelDefinition = {
    name: displayNameForModelId(id),
    limit: isClaude ? CLAUDE_LIMIT : isGptOss ? GPT_OSS_LIMIT : GEMINI_LIMIT,
    modalities: { input: [...MODALITIES.input], output: [...MODALITIES.output] },
  };

  if (isClaudeThinking) {
    definition.variants = { ...CLAUDE_THINKING_VARIANTS };
  } else if (!isClaude && !isGptOss) {
    definition.variants = { ...GEMINI_THINKING_VARIANTS };
  }

  return definition;
}

/**
 * Filters a backend catalog down to the ids worth surfacing and keys them by
 * their OpenCode model id (`antigravity-<backend id>`, matching the curated
 * catalog so the existing request resolution path applies unchanged).
 */
export function buildDiscoveredModels(backendIds: Iterable<string>): OpencodeModelDefinitions {
  const discovered: OpencodeModelDefinitions = {};
  for (const id of backendIds) {
    if (!isDiscoverableModelId(id)) continue;
    discovered[`antigravity-${id}`] = buildDiscoveredModelDefinition(id);
  }
  return discovered;
}

/**
 * Best-effort catalog lookup for a single account. Never throws: discovery is an
 * enhancement, so any failure (network, auth, backend change) degrades to the
 * curated catalog.
 */
export async function collectDiscoveredModels(
  accessToken: string,
  projectId?: string,
): Promise<OpencodeModelDefinitions> {
  if (!accessToken) return {};
  try {
    const response = await fetchAvailableModels(accessToken, projectId);
    const ids = Object.keys(response?.models ?? {});
    const discovered = buildDiscoveredModels(ids);
    const count = Object.keys(discovered).length;
    if (count > 0) {
      log.info(`Discovered ${count} extra model(s) for this account: ${Object.keys(discovered).join(", ")}`);
    }
    return discovered;
  } catch (error) {
    log.warn(
      `Model discovery skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}
