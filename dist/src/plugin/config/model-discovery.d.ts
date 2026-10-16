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
 * Ids (or id families) that must never be surfaced, with the measured reason.
 */
export declare const DISCOVERY_DENYLIST: RegExp[];
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
 * Limits and variants are conservative: unknown families get Gemini-sized limits.
 */
export declare function buildDiscoveredModelDefinition(id: string): OpencodeModelDefinition;
/**
 * Filters a backend catalog down to the ids worth surfacing and keys them by
 * their OpenCode model id (`antigravity-<backend id>`, matching the curated
 * catalog so the existing request resolution path applies unchanged).
 */
export declare function buildDiscoveredModels(backendIds: Iterable<string>): OpencodeModelDefinitions;
/**
 * Best-effort catalog lookup for a single account. Never throws: discovery is an
 * enhancement, so any failure (network, auth, backend change) degrades to the
 * curated catalog.
 */
export declare function collectDiscoveredModels(accessToken: string, projectId?: string): Promise<OpencodeModelDefinitions>;
//# sourceMappingURL=model-discovery.d.ts.map