export * as TieredFamilies from "./tiered-families.js"

/**
 * The backend advertises a thinking tier as an id suffix: `gemini-4-argon-high`,
 * `claude-sonnet-5-5-max`, and, as new families land, suffixes nobody taught the
 * plugin (`hyperion-minimal`).
 *
 * Two things are learned from the catalog at discovery time instead of being
 * listed here:
 *
 * - the tier vocabulary, so a family that debuts `minimal` or `ultra` shows up;
 * - how each family encodes its tiers, so the request path can build the right
 *   backend id without a hardcoded list of family names.
 */

/** Order used to lay out the variant picker; unknown tiers follow, alphabetically. */
const KNOWN_ORDER = ["minimal", "low", "medium", "high", "max"] as const

/** Lower is cheaper. Unknown tiers sort after the known ones. */
export function compareTiers(a: string, b: string) {
  const index = (tier: string) => {
    const at = (KNOWN_ORDER as readonly string[]).indexOf(tier.toLowerCase())
    return at === -1 ? KNOWN_ORDER.length : at
  }
  const [ia, ib] = [index(a), index(b)]
  return ia === ib ? a.toLowerCase().localeCompare(b.toLowerCase()) : ia - ib
}

/** family base -> tiers it was observed to advertise */
const families = new Map<string, string[]>()

export function rememberTieredFamily(base: string, tiers: readonly string[]) {
  const key = base.toLowerCase()
  const merged = new Set([...(families.get(key) ?? []), ...tiers.map((tier) => tier.toLowerCase())])
  families.set(key, [...merged].sort(compareTiers))
}

export function forgetTieredFamilies() {
  families.clear()
}

export interface TieredFamily {
  readonly base: string
  readonly tiers: readonly string[]
}

/**
 * Family a model belongs to, when discovery saw the backend split it by tier.
 * `antigravity-gemini-4-argon` resolves to `gemini-4-argon` with its tiers.
 */
export function tieredFamilyOf(model: string): TieredFamily | undefined {
  const normalized = model.toLowerCase().replace(/^antigravity-/, "")
  const tiers = families.get(normalized)
  if (tiers && tiers.length > 0) return { base: normalized, tiers }

  // A variant name may arrive with the tier still attached (`gemini-4-argon-high`).
  for (const [base, seen] of families) {
    const suffix = normalized.startsWith(`${base}-`) ? normalized.slice(base.length + 1) : undefined
    if (suffix && seen.includes(suffix)) return { base, tiers: seen }
  }
  return undefined
}

/**
 * Splits catalog ids into `base -> tiers` for every family the backend named more
 * than once. A base counts when the catalog lists it on its own (`hyperion`) or
 * when at least two ids end in a different single-word suffix
 * (`hyperion-low`, `hyperion-high`), which is what keeps one-off ids such as
 * `claude-opus-4-6-thinking` from being read as a tier.
 */
export function isKnownTier(suffix: string) {
  return (KNOWN_ORDER as readonly string[]).includes(suffix.toLowerCase())
}

export function groupTieredFamilies(ids: Iterable<string>): Map<string, string[]> {
  const byId = new Set<string>()
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim().toLowerCase() : ""
    if (id) byId.add(id)
  }

  const candidates = new Map<string, Set<string>>()
  for (const id of byId) {
    const cut = id.lastIndexOf("-")
    if (cut <= 0) continue
    const base = id.slice(0, cut)
    const suffix = id.slice(cut + 1)
    if (!/^[a-z][a-z0-9]*$/.test(suffix)) continue
    // Only a known tier, or a suffix next to a base the catalog lists on its own,
    // reads as a tier. Without that, `gemini-2.5-flash` and `gemini-2.5-pro` would
    // group as one family with `flash` and `pro` as variants.
    if (!isKnownTier(suffix) && !byId.has(base)) continue
    const set = candidates.get(base) ?? new Set<string>()
    set.add(suffix)
    candidates.set(base, set)
  }

  const grouped = new Map<string, string[]>()
  for (const [base, tiers] of candidates) {
    const ambiguous = [...tiers].some((tier) => !isKnownTier(tier));
    // An unknown suffix is only trusted when the catalog also names the plain base
    // (`hyperion` next to `hyperion-ultra`), never on its own.
    if (ambiguous && !byId.has(base)) continue;
    if (tiers.size < 2 && !byId.has(base)) continue;
    grouped.set(base, [...tiers].sort(compareTiers))
  }
  return grouped
}
