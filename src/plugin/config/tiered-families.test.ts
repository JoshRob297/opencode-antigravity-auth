import { beforeEach, describe, expect, test } from "vitest"
import { compareTiers, forgetTieredFamilies, groupTieredFamilies, rememberTieredFamily, tieredFamilyOf } from "./tiered-families"

describe("TieredFamilies.groupTieredFamilies", () => {
  test("learns a family from the catalog, including tiers nobody knew", () => {
    const grouped = groupTieredFamilies([
      "hyperion",
      "hyperion-minimal",
      "hyperion-low",
      "hyperion-medium",
      "hyperion-high",
    ])
    expect(grouped.get("hyperion")).toEqual(["minimal", "low", "medium", "high"])
  })

  test("groups suffixed siblings even when the base is not listed", () => {
    const grouped = groupTieredFamilies(["claude-sonnet-5-5-low", "claude-sonnet-5-5-high"])
    expect(grouped.get("claude-sonnet-5-5")).toEqual(["low", "high"])
  })

  test("leaves a one-off suffix alone", () => {
    const grouped = groupTieredFamilies(["claude-opus-4-6-thinking", "gemini-3-flash"])
    expect(grouped.size).toBe(0)
  })
})

describe("TieredFamilies.compareTiers", () => {
  test("orders known tiers and keeps unknown ones after them", () => {
    const tiers = ["high", "ultra", "minimal", "low"].sort(compareTiers)
    expect(tiers).toEqual(["minimal", "low", "high", "ultra"])
  })
})

describe("TieredFamilies.tieredFamilyOf", () => {
  beforeEach(() => forgetTieredFamilies())

  test("resolves the family from a plugin model name or a backend id", () => {
    rememberTieredFamily("hyperion", ["minimal", "low", "high"])
    expect(tieredFamilyOf("antigravity-hyperion")).toEqual({ base: "hyperion", tiers: ["minimal", "low", "high"] })
    expect(tieredFamilyOf("hyperion-high")).toEqual({ base: "hyperion", tiers: ["minimal", "low", "high"] })
    expect(tieredFamilyOf("gemini-3.8-flash")).toBeUndefined()
  })
})
