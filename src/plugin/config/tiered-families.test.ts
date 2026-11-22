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

  test("collapses -tiered before and after tier without merging distinct sibling models", () => {
    const grouped = groupTieredFamilies([
      "gemini-4-hydrogen-low",
      "gemini-4-hydrogen-high",
      "gemini-4-hydrogen-tiered-high",
      "gemini-4-hydrogen-tiered-xhigh",
      "gemini-4-hydrogen-medium-tiered",
      "gemini-4-hydrogen-sonar",
    ])
    expect(grouped.get("gemini-4-hydrogen")).toEqual(["low", "medium", "high", "xhigh"])
    expect(grouped.has("gemini-4-hydrogen-tiered")).toBe(false)
  })
})

describe("TieredFamilies.compareTiers", () => {
  test("orders known tiers including xhigh above high and keeps unknown ones after them", () => {
    const tiers = ["max", "high", "ultra", "minimal", "xhigh", "low"].sort(compareTiers)
    expect(tiers).toEqual(["minimal", "low", "high", "xhigh", "max", "ultra"])
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
