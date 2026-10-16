import type { OpencodeModelDefinition, OpencodeModelDefinitions } from "./models";
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
export declare const DISCOVERY_ALLOWLIST: RegExp[];
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