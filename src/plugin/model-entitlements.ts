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
import type { AccountModelCatalog, AccountModelCatalogEntry } from "./storage";

/** How long a measured catalog is trusted before it is treated as unknown. */
export const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;

/** Ids the backend returns to signal "you know this model exists, you cannot use it". */
const DISABLED_ID = /-disabled$/i;

/** Shallow view of one `fetchAvailableModels` entry; only what is read here. */
interface RawCatalogEntry {
  displayName?: unknown;
  maxTokens?: unknown;
  maxOutputTokens?: unknown;
  quotaInfo?: { remainingFraction?: unknown; resetTime?: unknown } | null;
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

/**
 * Builds the usable-model catalog of a single account from a
 * `fetchAvailableModels` response. Never throws: a malformed entry is skipped.
 */
export function buildAccountModelCatalog(response: unknown): AccountModelCatalog {
  const models: Record<string, AccountModelCatalogEntry> = {};
  const rawModels = (response as { models?: Record<string, RawCatalogEntry> } | null)?.models;
  if (rawModels && typeof rawModels === "object") {
    for (const [rawId, entry] of Object.entries(rawModels)) {
      const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
      if (!id) continue;
      if (DISABLED_ID.test(id)) continue;
      if (!entry || !entry.quotaInfo) continue;
      const resetTime = typeof entry.quotaInfo.resetTime === "string" ? entry.quotaInfo.resetTime : undefined;
      const remainingFraction =
        typeof entry.quotaInfo.remainingFraction === "number"
          && Number.isFinite(entry.quotaInfo.remainingFraction)
          ? Math.max(0, Math.min(1, entry.quotaInfo.remainingFraction as number))
          : undefined;
      models[id] = {
        displayName: typeof entry.displayName === "string" ? entry.displayName : undefined,
        maxTokens: positiveInt(entry.maxTokens),
        maxOutputTokens: positiveInt(entry.maxOutputTokens),
        remainingFraction,
        resetTime,
      };
    }
  }
  return { updatedAt: Date.now(), models };
}

/**
 * Candidate catalog ids for a model id as OpenCode/OpenCode-side transforms spell
 * it. `antigravity-gemini-4-argon-medium` → `gemini-4-argon-medium`, and the
 * `-preview` suffixes the CLI adds are stripped the same way the request
 * resolver does it.
 */
export function normalizeRequestedModelId(requested: string): string[] {
  const trimmed = typeof requested === "string" ? requested.trim().toLowerCase() : "";
  if (!trimmed) return [];
  const candidates = new Set<string>();
  const noPrefix = trimmed.replace(/^antigravity-/, "");
  candidates.add(trimmed);
  candidates.add(noPrefix);
  const noPreview = noPrefix.replace(/-preview-customtools$/i, "").replace(/-preview$/i, "");
  candidates.add(noPreview);
  candidates.delete("");
  return [...candidates];
}

/**
 * True when the catalog proves the account can serve the model, false when it
 * proves it cannot, and "unknown" when there is no fresh catalog to judge from.
 *
 * "unknown" must never block: a pool that never measured its catalogs keeps
 * behaving exactly as before this feature existed.
 */
export function catalogAllowsModel(
  catalog: AccountModelCatalog | undefined,
  requested: string,
  ttlMs: number = MODEL_CATALOG_TTL_MS,
  now: number = Date.now(),
): boolean | "unknown" {
  if (!catalog || !catalog.models || catalog.updatedAt == null) return "unknown";
  const ids = Object.keys(catalog.models);
  if (ids.length === 0) return "unknown";
  if (!Number.isFinite(catalog.updatedAt) || now - catalog.updatedAt > ttlMs) return "unknown";

  const candidates = normalizeRequestedModelId(requested);
  if (candidates.length === 0) return "unknown";

  for (const candidate of candidates) {
    if (catalog.models[candidate]) return true;
    // Tier/base equivalence: the catalog lists the concrete ids
    // (`gemini-4-argon-low`, `gemini-3.8-flash-tiered`) while the request may
    // name the family (`gemini-4-argon`) or the curated id (`gemini-3.8-flash`).
    if (ids.some((id) => id.startsWith(`${candidate}-`))) return true;
  }
  return false;
}
