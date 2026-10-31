/** How long a measured catalog is trusted before it is treated as unknown. */
export const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
/** Ids the backend returns to signal "you know this model exists, you cannot use it". */
const DISABLED_ID = /-disabled$/i;
function positiveInt(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
/**
 * Builds the usable-model catalog of a single account from a
 * `fetchAvailableModels` response. Never throws: a malformed entry is skipped.
 */
export function buildAccountModelCatalog(response) {
    const models = {};
    const rawModels = response?.models;
    if (rawModels && typeof rawModels === "object") {
        for (const [rawId, entry] of Object.entries(rawModels)) {
            const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
            if (!id)
                continue;
            if (DISABLED_ID.test(id))
                continue;
            if (!entry || !entry.quotaInfo)
                continue;
            const resetTime = typeof entry.quotaInfo.resetTime === "string" ? entry.quotaInfo.resetTime : undefined;
            const remainingFraction = typeof entry.quotaInfo.remainingFraction === "number"
                && Number.isFinite(entry.quotaInfo.remainingFraction)
                ? Math.max(0, Math.min(1, entry.quotaInfo.remainingFraction))
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
export function normalizeRequestedModelId(requested) {
    const trimmed = typeof requested === "string" ? requested.trim().toLowerCase() : "";
    if (!trimmed)
        return [];
    const candidates = new Set();
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
export function catalogAllowsModel(catalog, requested, ttlMs = MODEL_CATALOG_TTL_MS, now = Date.now()) {
    if (!catalog || !catalog.models || catalog.updatedAt == null)
        return "unknown";
    const ids = Object.keys(catalog.models);
    if (ids.length === 0)
        return "unknown";
    if (!Number.isFinite(catalog.updatedAt) || now - catalog.updatedAt > ttlMs)
        return "unknown";
    const candidates = normalizeRequestedModelId(requested);
    if (candidates.length === 0)
        return "unknown";
    for (const candidate of candidates) {
        if (catalog.models[candidate])
            return true;
        // Tier/base equivalence: the catalog lists the concrete ids
        // (`gemini-4-argon-low`, `gemini-3.8-flash-tiered`) while the request may
        // name the family (`gemini-4-argon`) or the curated id (`gemini-3.8-flash`).
        if (ids.some((id) => id.startsWith(`${candidate}-`)))
            return true;
    }
    return false;
}
//# sourceMappingURL=model-entitlements.js.map