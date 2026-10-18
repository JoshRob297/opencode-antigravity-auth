import type { OpencodeModelDefinition, OpencodeModelDefinitions, ModelVariant } from "./models";
import { OPENCODE_WHITELIST_MODELS } from "./models";
import { fetchAvailableModels } from "../quota";
import { createLogger } from "../logger";

const log = createLogger("model-discovery");

/**
 * Optional dynamic model discovery.
 *
 * The Antigravity backend returns a per-account model catalog through
 * `fetchAvailableModels`, which is an authoritative answer to "what can this
 * account reach". Discovery uses it for one purpose only: surfacing a model
 * **newer** than the curated catalog (the Gemini 4 "Argon" line and whatever
 * follows) without waiting for a plugin release.
 *
 * It is deliberately not a mirror of the catalog. The catalog is full of ids the
 * official Antigravity client does not offer, and they cannot be told apart by
 * status code: measured against a real consumer account on 2026-10-15, 12 of 25
 * ids answered `200` **and** performed tool calls, including generations older
 * than the curated 3.8 Flash - one of them (`gemini-3.5-flash`) answers `200`
 * while being decommissioned ("Gemini 3.5 Flash is no longer available").
 * Adding those would only widen an unsupported surface.
 */

/**
 * Id families that may be surfaced by discovery.
 *
 * Forward-only by design: discovery exists to expose a model **newer** than the
 * curated catalog (Gemini 4 "Argon" and whatever follows), never to resurrect
 * older generations. Everything the backend still lists but the official
 * Antigravity client (`agy`) does not offer is either legacy kept alive for
 * other clients or decommissioned: those ids are not surfaced even though they
 * answer `200` and can do tool calls (measured 2026-10-15 - `gemini-3-flash`,
 * `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-2.5-flash*` all did).
 */
export const DISCOVERY_ALLOWLIST: RegExp[] = [
  /^gemini-4[.-]/, // Gemini 4 "Argon" line: surfaced only for accounts that have it
];

/**
 * Newest Gemini Flash generation in the curated catalog
 * (`antigravity-gemini-3.8-flash`). Discovery only surfaces strictly newer ones,
 * so a newer Flash tier shows up without waiting for a plugin release.
 */
export const DISCOVERY_GEMINI_FLASH_FLOOR = { major: 3, minor: 8 };

const GEMINI_FLASH_VERSION = /^gemini-(\d+)(?:\.(\d+))?-flash(?:[-.]|$)/i;

/**
 * True when a Gemini Flash id is a newer generation than the curated floor.
 */
function isNewerGeminiFlash(id: string): boolean {
  const match = GEMINI_FLASH_VERSION.exec(id);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  const floor = DISCOVERY_GEMINI_FLASH_FLOOR;
  return major > floor.major || (major === floor.major && minor > floor.minor);
}

/**
 * Ids (or id families) that must never be surfaced, with the measured reason.
 */
export const DISCOVERY_DENYLIST: RegExp[] = [
  /^chat_\d+/i, // internal ids, HTTP 400
  /^tab_/i, // internal tab preview models
  /-image/i, // image output needs capabilities this catalog does not declare
  /^gemini-3\.6-flash/i, // 404 NOT_FOUND
  /^gemini-3\.1-pro/i, // 404 NOT_FOUND
  /^gemini-pro-agent$/i, // 404 NOT_FOUND
  /^gemini-3-flash-agent$/i, // 200 + "Gemini 3.5 Flash is no longer available"
  /^gemini-3\.5-flash$/i, // 200 + canned "no longer available"
  /^gemini-3\.5-flash-(?:low|high|extra-low)$/i, // retired or 404
  /^gemini-2\.5-pro$/i, // 503 "no capacity available for model" (2026-10-15)
];

/**
 * How the backend names the tiered variant of a model whose thinking level is
 * chosen per request (`gemini-3.8-flash-tiered` is what the catalog reports for
 * the curated 3.8 Flash). It is a legitimate id, not junk: the only reason to
 * skip it is that the curated catalog already registers that same model.
 */
const TIERED_SUFFIX = /-tiered$/i;

/**
 * True when the curated catalog already registers this model (with or without
 * the `-tiered` suffix), so discovery must not add a duplicate entry.
 *
 * This is what keeps `gemini-3.8-flash-tiered` out while still surfacing
 * `gemini-4-argon-tiered`: a model with no curated entry has to stay selectable,
 * otherwise a brand new family would be hidden by a naming detail.
 */
export function isCoveredByCuratedCatalog(id: string): boolean {
  const curated = new Set(OPENCODE_WHITELIST_MODELS);
  const candidates = [id, id.replace(TIERED_SUFFIX, "")];
  return candidates.some((candidate) => curated.has(`antigravity-${candidate}`));
}

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
  if (DISCOVERY_ALLOWLIST.some((pattern) => pattern.test(candidate))) return true;
  return isNewerGeminiFlash(candidate);
}

/**
 * Human-readable label for a backend id that has no curated entry.
 */
export function displayNameForModelId(id: string): string {
  const overrides: Record<string, string> = {
    "gpt-oss-120b-medium": "GPT-OSS 120B (Medium)",
  };
  if (overrides[id]) return overrides[id]!;

  // The `-tiered` suffix is a backend mechanic (the thinking level is chosen per
  // request through the variants), so it is dropped from the label only.
  const formatted = id
    .replace(TIERED_SUFFIX, "")
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
    if (isCoveredByCuratedCatalog(id)) continue;
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
