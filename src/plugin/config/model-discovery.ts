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

/**
 * Newest Claude generation in the curated catalog (`antigravity-claude-opus-4-6-thinking`).
 * Discovery surfaces strictly newer generations, which is what makes the
 * successors of the Claude 4.6 trio - removed on 2026-11-02 for **every** plan -
 * available to the accounts that are entitled to them (Claude Sonnet/Opus 5.5 on
 * paid AI Pro, Ultra and Enterprise) without a plugin release or an unverifiable
 * curated entry.
 */
export const DISCOVERY_CLAUDE_FLOOR = { major: 4, minor: 6 };

const GEMINI_FLASH_VERSION = /^gemini-(\d+)(?:\.(\d+))?-flash(?:[-.]|$)/i;
const CLAUDE_VERSION = /^claude-(?:sonnet|opus)-(\d+)(?:-(\d+))?/i;

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
 * True when a Claude id is a newer generation than the curated floor.
 * The backend names these with a dash, e.g. `claude-opus-5-5` or
 * `claude-sonnet-5-5-max`; older ones (`claude-opus-4-8`, `claude-opus-4-6-thinking`)
 * stay out.
 */
function isNewerClaude(id: string): boolean {
  const match = CLAUDE_VERSION.exec(id);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  const floor = DISCOVERY_CLAUDE_FLOOR;
  return major > floor.major || (major === floor.major && minor > floor.minor);
}

/**
 * Ids (or id families) that must never be surfaced, with the measured reason.
 */
export const DISCOVERY_DENYLIST: RegExp[] = [
  /^chat_\d+/i, // internal ids, HTTP 400
  /^tab_/i, // internal tab preview models
  /-image/i, // image output needs capabilities this catalog does not declare
  /-disabled$/i, // entitlement placeholder: listed for accounts that cannot use the model (404 NOT_FOUND)
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
 * Thinking tiers the backend encodes as an id suffix
 * (`gemini-4-argon-medium`, `claude-sonnet-5-5-high`).
 *
 * Discovery groups them into **one** selector entry with a variant per tier:
 * three "Claude Sonnet 5.5" rows in the model picker for what is one model with
 * a thinking dial is noise, and the curated catalog already models 3.8 Flash that
 * way (`antigravity-gemini-3.8-flash` + `low|medium|high` variants).
 */
const TIER_SUFFIX = /-(low|medium|high|max)$/i;
const TIER_ORDER = ["low", "medium", "high", "max"] as const;
type TierName = (typeof TIER_ORDER)[number];

/** Backend limits measured from `fetchAvailableModels`, keyed by backend id. */
export interface DiscoveredModelMetadata {
  maxTokens?: number;
  maxOutputTokens?: number;
}

function tierOf(id: string): TierName | undefined {
  const match = TIER_SUFFIX.exec(id);
  return match ? (match[1]!.toLowerCase() as TierName) : undefined;
}

/**
 * Canonical family id used to group tier variants. `-tiered` and an explicit
 * tier both collapse onto the plain family id.
 */
function familyIdOf(id: string): string {
  return id.replace(TIERED_SUFFIX, "").replace(TIER_SUFFIX, "").toLowerCase();
}

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
  const candidates = [id, id.replace(TIERED_SUFFIX, ""), familyIdOf(id)];
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
  return isNewerGeminiFlash(candidate) || isNewerClaude(candidate);
}

/**
 * Human-readable label for a backend id that has no curated entry.
 */
export function displayNameForModelId(id: string): string {
  const overrides: Record<string, string> = {
    "gpt-oss-120b-medium": "GPT-OSS 120B (Medium)",
  };
  if (overrides[id]) return overrides[id]!;

  // `claude-opus-5-5-max` reads better as "Claude Opus 5.5 Max" than as a
  // dash-split humanization ("Claude Opus 5 5 Max").
  const claude = /^claude-(sonnet|opus)-(\d+)-(\d+)(?:-(.+))?$/i.exec(id);
  if (claude) {
    const family = claude[1]!.charAt(0).toUpperCase() + claude[1]!.slice(1).toLowerCase();
    const tier = claude[4]
      ? " " + claude[4].split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")
      : "";
    return `Claude ${family} ${claude[2]}.${claude[3]}${tier} (Antigravity)`;
  }

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
 * Limits come from the backend when it declares them, and fall back to
 * conservative family defaults otherwise.
 */
export function buildDiscoveredModelDefinition(
  id: string,
  metadata?: DiscoveredModelMetadata,
  tiers?: readonly TierName[],
): OpencodeModelDefinition {
  const lower = id.toLowerCase();
  const isClaude = lower.startsWith("claude-");
  const isGptOss = lower.startsWith("gpt-oss-");

  const context = Number.isFinite(metadata?.maxTokens) && (metadata!.maxTokens as number) > 0
    ? (metadata!.maxTokens as number)
    : undefined;
  const output = Number.isFinite(metadata?.maxOutputTokens) && (metadata!.maxOutputTokens as number) > 0
    ? (metadata!.maxOutputTokens as number)
    : undefined;

  const definition: OpencodeModelDefinition = {
    name: displayNameForModelId(id),
    limit: {
      context: context ?? (isClaude ? CLAUDE_LIMIT.context : isGptOss ? GPT_OSS_LIMIT.context : GEMINI_LIMIT.context),
      output: output ?? (isClaude ? CLAUDE_LIMIT.output : isGptOss ? GPT_OSS_LIMIT.output : GEMINI_LIMIT.output),
    },
    modalities: { input: [...MODALITIES.input], output: [...MODALITIES.output] },
  };

  const observed = tiers && tiers.length > 0 ? tiers : undefined;

  if (isClaude) {
    // The backend encodes the thinking tier in the id (`claude-sonnet-5-5-low`),
    // so each variant only needs to name it; the request resolver appends the
    // suffix. `max` has no `thinkingLevel` in OpenCode's type, so it keeps the
    // budget form and the resolver maps it back to the `-max` suffix.
    definition.variants = observed
      ? Object.fromEntries(
          observed.map((tier) => [
            tier,
            tier === "max"
              ? { thinkingConfig: { thinkingBudget: CLAUDE_THINKING_VARIANTS.max!.thinkingConfig!.thinkingBudget } }
              : { thinkingLevel: tier as "low" | "medium" | "high" },
          ]),
        )
      : { ...CLAUDE_THINKING_VARIANTS };
  } else if (!isGptOss) {
    definition.variants = observed
      ? Object.fromEntries(observed.map((tier) => [tier, { thinkingLevel: tier as "low" | "medium" | "high" }]))
      : { ...GEMINI_THINKING_VARIANTS };
  }

  return definition;
}

/**
 * Filters a backend catalog down to the ids worth surfacing and groups thinking
 * tiers into a single selector entry with variants.
 *
 * `gemini-4-argon-low|medium|high` becomes one `antigravity-gemini-4-argon` with
 * a `low|medium|high` variant picker, and the same for
 * `claude-sonnet-5-5-*` / `claude-opus-5-5-*`.
 */
export function buildDiscoveredModels(
  backendIds: Iterable<string>,
  metadata: Record<string, DiscoveredModelMetadata> = {},
): OpencodeModelDefinitions {
  const groups = new Map<string, { tiers: Set<TierName>; ids: Set<string>; sawTierless: boolean }>();

  for (const rawId of backendIds) {
    const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
    if (!isDiscoverableModelId(id)) continue;
    if (isCoveredByCuratedCatalog(id)) continue;

    const family = familyIdOf(id);
    const tier = tierOf(id);
    const group = groups.get(family) ?? { tiers: new Set<TierName>(), ids: new Set<string>(), sawTierless: false };
    if (tier) {
      group.tiers.add(tier);
    } else {
      group.sawTierless = true;
    }
    group.ids.add(id);
    groups.set(family, group);
  }

  const discovered: OpencodeModelDefinitions = {};
  for (const [family, group] of groups) {
    const observedTiers = TIER_ORDER.filter((tier) => group.tiers.has(tier));
    // Limits are declared per concrete id, so take them from whichever id in the
    // group actually carries them (they are identical across tiers).
    const groupMetadata: DiscoveredModelMetadata | undefined =
      metadata[family] ??
      [...group.ids]
        .map((id) => metadata[id])
        .find((entry): entry is DiscoveredModelMetadata => Boolean(entry && (entry.maxTokens || entry.maxOutputTokens)));
    const definition = buildDiscoveredModelDefinition(family, groupMetadata, observedTiers);
    discovered[`antigravity-${family}`] = definition;
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
    const models = (response?.models ?? {}) as Record<string, DiscoveredModelMetadata | undefined>;
    const metadata: Record<string, DiscoveredModelMetadata> = {};
    for (const [id, entry] of Object.entries(models)) {
      if (!entry) continue;
      metadata[id.trim().toLowerCase()] = {
        maxTokens: entry.maxTokens,
        maxOutputTokens: entry.maxOutputTokens,
      };
    }
    const discovered = buildDiscoveredModels(Object.keys(models), metadata);
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

/**
 * Union of the catalogs of every account in the pool.
 *
 * Discovery used to ask the *active* account only, so a pool whose cursor sat on
 * a non-entitled account hid Argon/Claude 5.5 from the picker even when another
 * account had them. The union keeps the selector honest: a model is offered when
 * at least one account can serve it, and rotation (see `modelCatalog`) makes sure
 * the request lands on that account.
 */
export async function collectDiscoveredModelsFromPool(
  accounts: Array<{ accessToken: string; projectId?: string }>,
): Promise<OpencodeModelDefinitions> {
  const mergedIds = new Set<string>();
  const mergedMetadata: Record<string, DiscoveredModelMetadata> = {};

  for (const account of accounts) {
    if (!account.accessToken) continue;
    try {
      const response = await fetchAvailableModels(account.accessToken, account.projectId);
      const models = (response?.models ?? {}) as Record<string, DiscoveredModelMetadata | undefined>;
      for (const [rawId, entry] of Object.entries(models)) {
        const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
        if (!id) continue;
        mergedIds.add(id);
        if (entry && !mergedMetadata[id]) {
          mergedMetadata[id] = { maxTokens: entry.maxTokens, maxOutputTokens: entry.maxOutputTokens };
        }
      }
    } catch (error) {
      log.warn(
        `Model discovery skipped for one account: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const discovered = buildDiscoveredModels(mergedIds, mergedMetadata);
  const count = Object.keys(discovered).length;
  if (count > 0) {
    log.info(`Discovered ${count} extra model(s) across the pool: ${Object.keys(discovered).join(", ")}`);
  }
  return discovered;
}
