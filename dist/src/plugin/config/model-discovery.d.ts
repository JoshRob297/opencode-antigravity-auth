import type { OpencodeModelDefinition, OpencodeModelDefinitions } from "./models";
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
export declare const DISCOVERY_ALLOWLIST: RegExp[];
/**
 * Newest Gemini Flash generation in the curated catalog
 * (`antigravity-gemini-3.8-flash`). Discovery only surfaces strictly newer ones,
 * so a newer Flash tier shows up without waiting for a plugin release.
 */
export declare const DISCOVERY_GEMINI_FLASH_FLOOR: {
    major: number;
    minor: number;
};
/**
 * Newest Claude generation in the curated catalog (`antigravity-claude-opus-4-6-thinking`).
 * Discovery surfaces strictly newer generations, which is what makes the
 * successors of the Claude 4.6 trio - removed on 2026-11-02 for **every** plan -
 * available to the accounts that are entitled to them (Claude Sonnet/Opus 5.5 on
 * paid AI Pro, Ultra and Enterprise) without a plugin release or an unverifiable
 * curated entry.
 */
export declare const DISCOVERY_CLAUDE_FLOOR: {
    major: number;
    minor: number;
};
/**
 * Ids (or id families) that must never be surfaced, with the measured reason.
 */
export declare const DISCOVERY_DENYLIST: RegExp[];
declare const TIER_ORDER: readonly ["low", "medium", "high", "max"];
type TierName = (typeof TIER_ORDER)[number];
/** Backend limits measured from `fetchAvailableModels`, keyed by backend id. */
export interface DiscoveredModelMetadata {
    maxTokens?: number;
    maxOutputTokens?: number;
}
/**
 * True when the curated catalog already registers this model (with or without
 * the `-tiered` suffix), so discovery must not add a duplicate entry.
 *
 * This is what keeps `gemini-3.8-flash-tiered` out while still surfacing
 * `gemini-4-argon-tiered`: a model with no curated entry has to stay selectable,
 * otherwise a brand new family would be hidden by a naming detail.
 */
export declare function isCoveredByCuratedCatalog(id: string): boolean;
/**
 * True when an id returned by the backend catalog may be surfaced to the user.
 */
export declare function isDiscoverableModelId(id: string): boolean;
/**
 * Human-readable label for a backend id that has no curated entry.
 */
export declare function displayNameForModelId(id: string): string;
/**
 * Builds an OpenCode model definition for a discovered backend id.
 * Limits come from the backend when it declares them, and fall back to
 * conservative family defaults otherwise.
 */
export declare function buildDiscoveredModelDefinition(id: string, metadata?: DiscoveredModelMetadata, tiers?: readonly TierName[]): OpencodeModelDefinition;
/**
 * Filters a backend catalog down to the ids worth surfacing and groups thinking
 * tiers into a single selector entry with variants.
 *
 * `gemini-4-argon-low|medium|high` becomes one `antigravity-gemini-4-argon` with
 * a `low|medium|high` variant picker, and the same for
 * `claude-sonnet-5-5-*` / `claude-opus-5-5-*`.
 */
export declare function buildDiscoveredModels(backendIds: Iterable<string>, metadata?: Record<string, DiscoveredModelMetadata>): OpencodeModelDefinitions;
/**
 * Best-effort catalog lookup for a single account. Never throws: discovery is an
 * enhancement, so any failure (network, auth, backend change) degrades to the
 * curated catalog.
 */
export declare function collectDiscoveredModels(accessToken: string, projectId?: string): Promise<OpencodeModelDefinitions>;
/**
 * Union of the catalogs of every account in the pool.
 *
 * Discovery used to ask the *active* account only, so a pool whose cursor sat on
 * a non-entitled account hid Argon/Claude 5.5 from the picker even when another
 * account had them. The union keeps the selector honest: a model is offered when
 * at least one account can serve it, and rotation (see `modelCatalog`) makes sure
 * the request lands on that account.
 */
export declare function collectDiscoveredModelsFromPool(accounts: Array<{
    accessToken: string;
    projectId?: string;
}>): Promise<OpencodeModelDefinitions>;
export {};
//# sourceMappingURL=model-discovery.d.ts.map