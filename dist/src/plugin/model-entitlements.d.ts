/**
 * Per-account model entitlements.
 *
 * `fetchAvailableModels` is the backend's authoritative answer to "what can this
 * account reach", and it is *per account*: with a mixed pool (Free / AI Plus next
 * to an account that was granted Gemini 4 "Argon") the same request succeeds on
 * one account and answers `404 NOT_FOUND` on the other.
 *
 * Measured 2026-10-31 against two Free/AI Plus accounts and one account with the
 * Argon grant:
 *   - every id the account can actually use carries a `quotaInfo` block;
 *   - an id the account is not entitled to comes back as `<id>-disabled`
 *     (`gemini-4-argon-disabled`) with **no** `quotaInfo` block at all;
 *   - requesting that disabled id answers 404 NOT_FOUND, and so does requesting
 *     the real id from a non-entitled account.
 *
 * So the rule used here is: an entry is usable only when it has a `quotaInfo`
 * block and an id that is not marked `-disabled`.
 */
import type { AccountModelCatalog } from "./storage";
/** How long a measured catalog is trusted before it is treated as unknown. */
export declare const MODEL_CATALOG_TTL_MS: number;
/**
 * Builds the usable-model catalog of a single account from a
 * `fetchAvailableModels` response. Never throws: a malformed entry is skipped.
 */
export declare function buildAccountModelCatalog(response: unknown): AccountModelCatalog;
/**
 * Candidate catalog ids for a model id as OpenCode/OpenCode-side transforms spell
 * it. `antigravity-gemini-4-argon-medium` → `gemini-4-argon-medium`, and the
 * `-preview` suffixes the CLI adds are stripped the same way the request
 * resolver does it.
 */
export declare function normalizeRequestedModelId(requested: string): string[];
/**
 * True when the catalog proves the account can serve the model, false when it
 * proves it cannot, and "unknown" when there is no fresh catalog to judge from.
 *
 * "unknown" must never block: a pool that never measured its catalogs keeps
 * behaving exactly as before this feature existed.
 */
export declare function catalogAllowsModel(catalog: AccountModelCatalog | undefined, requested: string, ttlMs?: number, now?: number): boolean | "unknown";
//# sourceMappingURL=model-entitlements.d.ts.map