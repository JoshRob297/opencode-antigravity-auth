import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../quota", () => ({
  fetchAvailableModels: vi.fn(),
}));

import { fetchAvailableModels } from "../quota";
import {
  DISCOVERY_GEMINI_FLASH_FLOOR,
  buildDiscoveredModelDefinition,
  buildDiscoveredModels,
  collectDiscoveredModels,
  displayNameForModelId,
  isCoveredByCuratedCatalog,
  isDiscoverableModelId,
} from "./model-discovery";

/**
 * Real catalog returned by `fetchAvailableModels` for a consumer account
 * (measured 2026-10-15), with the verdict each id got when probed through the
 * plugin's own request envelope (including tool calls).
 *
 * Most of these DO answer 200 and DO perform tool calls, which is exactly why
 * the status code cannot be the criterion: the official Antigravity client does
 * not offer them, so they are legacy kept alive for other clients.
 */
const MEASURED_CATALOG: Array<[id: string, verdict: string]> = [
  ["chat_20706", "http400"],
  ["chat_23310", "http400"],
  ["claude-opus-4-6-thinking", "OK + tool calls"],
  ["claude-sonnet-4-6", "OK + tool calls"],
  ["gemini-2.5-flash", "OK + tool calls"],
  ["gemini-2.5-flash-lite", "OK + tool calls"],
  ["gemini-2.5-flash-thinking", "OK + tool calls"],
  ["gemini-2.5-pro", "503"],
  ["gemini-3-flash", "OK + tool calls"],
  ["gemini-3-flash-agent", "RETIRED"],
  ["gemini-3.1-flash-image", "image"],
  ["gemini-3.1-flash-lite", "OK + tool calls"],
  ["gemini-3.1-pro-high", "404"],
  ["gemini-3.1-pro-low", "404"],
  ["gemini-3.5-flash-extra-low", "404"],
  ["gemini-3.5-flash-lite", "OK + tool calls"],
  ["gemini-3.5-flash-low", "RETIRED"],
  ["gemini-3.6-flash-high", "404"],
  ["gemini-3.6-flash-low", "404"],
  ["gemini-3.6-flash-medium", "404"],
  ["gemini-3.8-flash-tiered", "tiered"],
  ["gemini-pro-agent", "404"],
  ["gpt-oss-120b-medium", "OK + tool calls"],
  ["tab_flash_lite_preview", "internal"],
  ["tab_jump_flash_lite_preview", "internal"],
];

describe("model discovery is forward-only", () => {
  it("surfaces nothing from the measured catalog", () => {
    // Every id here is either curated already, older than the curated 3.8 Flash,
    // dead, or internal. Discovery must add exactly zero models.
    expect(buildDiscoveredModels(MEASURED_CATALOG.map(([id]) => id))).toEqual({});
  });

  it.each(MEASURED_CATALOG.map(([id]) => id))("does not surface %s", (id) => {
    expect(isDiscoverableModelId(id)).toBe(false);
  });

  it("surfaces the Gemini 4 Argon family when the account has it", () => {
    expect(isDiscoverableModelId("gemini-4-argon")).toBe(true);
    expect(isDiscoverableModelId("gemini-4-argon-high")).toBe(true);
    expect(isDiscoverableModelId("gemini-4-flash")).toBe(true);
    expect(buildDiscoveredModels(["gemini-4-argon"])["antigravity-gemini-4-argon"]).toBeDefined();
  });

  it("surfaces Claude generations newer than the curated floor", () => {
    // Successors of the Claude 4.6 trio that Google removes on 2026-11-02.
    expect(isDiscoverableModelId("claude-sonnet-5-5")).toBe(true);
    expect(isDiscoverableModelId("claude-opus-5-5-max")).toBe(true);
    expect(isDiscoverableModelId("claude-opus-6-0-thinking")).toBe(true);
    // The curated generation, and anything older, stays out.
    expect(isDiscoverableModelId("claude-opus-4-6-thinking")).toBe(false);
    expect(isDiscoverableModelId("claude-sonnet-4-6")).toBe(false);
    expect(isDiscoverableModelId("claude-opus-4-5")).toBe(false);
    // Strictly newer than the curated 4.6 floor, including 4.8 (seen in the App bundle).
    expect(isDiscoverableModelId("claude-opus-4-8")).toBe(true);

    const discovered = buildDiscoveredModels(["claude-sonnet-5-5", "claude-opus-5-5-max"]);
    expect(Object.keys(discovered).sort()).toEqual([
      "antigravity-claude-opus-5-5-max",
      "antigravity-claude-sonnet-5-5",
    ]);
    expect(discovered["antigravity-claude-opus-5-5-max"]!.name).toBe("Claude Opus 5.5 Max (Antigravity)");
    expect(discovered["antigravity-claude-opus-5-5-max"]!.limit).toEqual({ context: 200000, output: 64000 });
    expect(discovered["antigravity-claude-opus-5-5-max"]!.variants?.max).toEqual({
      thinkingConfig: { thinkingBudget: 32768 },
    });
  });

  it("surfaces the tiered form of a model the curated catalog does not have", () => {
    // This is the shape the catalog uses for a tiered model. For a curated family
    // it must be skipped; for a new one it is the only id the account reports, so
    // skipping it would hide the model and defeat the point of discovery.
    expect(isCoveredByCuratedCatalog("gemini-3.8-flash-tiered")).toBe(true);
    expect(isCoveredByCuratedCatalog("gemini-4-argon-tiered")).toBe(false);

    const discovered = buildDiscoveredModels(["gemini-3.8-flash-tiered", "gemini-4-argon-tiered"]);
    expect(Object.keys(discovered)).toEqual(["antigravity-gemini-4-argon-tiered"]);
    expect(discovered["antigravity-gemini-4-argon-tiered"]!.name).toBe("Gemini 4 Argon (Antigravity)");
    expect(discovered["antigravity-gemini-4-argon-tiered"]!.variants?.high).toEqual({ thinkingLevel: "high" });
  });

  it("surfaces Gemini Flash generations newer than the curated floor", () => {
    expect(DISCOVERY_GEMINI_FLASH_FLOOR).toEqual({ major: 3, minor: 8 });
    expect(isDiscoverableModelId("gemini-3.9-flash")).toBe(true);
    expect(isDiscoverableModelId("gemini-3.9-flash-high")).toBe(true);
    expect(isDiscoverableModelId("gemini-5-flash")).toBe(true);
    // The curated generation itself, and anything older, stays out.
    expect(isDiscoverableModelId("gemini-3.8-flash")).toBe(false);
    expect(isDiscoverableModelId("gemini-3.8-flash-high")).toBe(false);
    expect(isDiscoverableModelId("gemini-3.7-flash")).toBe(false);
  });

  it("keeps the denylist ahead of the version floor", () => {
    expect(isDiscoverableModelId("gemini-4-argon-image")).toBe(false);
    expect(isDiscoverableModelId("gemini-4-argon-high")).toBe(true);
  });

  it("does not treat the -tiered suffix as junk", () => {
    // The catalog reports the curated 3.8 Flash as `gemini-3.8-flash-tiered`; the
    // id itself is legitimate, it is only skipped because it is already curated.
    expect(isDiscoverableModelId("gemini-3.8-flash-tiered")).toBe(false); // older than the floor
    expect(isDiscoverableModelId("gemini-4-argon-tiered")).toBe(true);
  });

  it("rejects unknown families and malformed ids", () => {
    expect(isDiscoverableModelId("definitely-not-a-model-xyz")).toBe(false);
    expect(isDiscoverableModelId("")).toBe(false);
    expect(isDiscoverableModelId("   ")).toBe(false);
  });
});

describe("model discovery definitions", () => {
  it("gives Gemini ids Gemini limits and thinking variants", () => {
    const def = buildDiscoveredModelDefinition("gemini-4-argon");
    expect(def.limit).toEqual({ context: 1048576, output: 65536 });
    expect(def.variants?.low).toEqual({ thinkingLevel: "low" });
    expect(def.variants?.high).toEqual({ thinkingLevel: "high" });
    expect(def.modalities).toEqual({ input: ["text", "image", "pdf"], output: ["text"] });
  });

  it("gives Claude ids Claude limits and thinking budgets", () => {
    const claude = buildDiscoveredModelDefinition("claude-sonnet-5-5-thinking");
    expect(claude.limit).toEqual({ context: 200000, output: 64000 });
    expect(claude.variants?.max).toEqual({ thinkingConfig: { thinkingBudget: 32768 } });
    // Non-thinking Claude ids get the same variants on purpose (inert at runtime,
    // mirrors the curated antigravity-claude-sonnet-4-6 entry).
    expect(buildDiscoveredModelDefinition("claude-opus-5-5").variants?.high).toEqual({
      thinkingConfig: { thinkingBudget: 24576 },
    });
  });

  it("gives GPT-OSS ids its own limits and no variants", () => {
    const def = buildDiscoveredModelDefinition("gpt-oss-120b-medium");
    expect(def.limit).toEqual({ context: 131072, output: 8192 });
    expect(def.variants).toBeUndefined();
  });

  it("humanizes ids that have no curated name", () => {
    expect(displayNameForModelId("gemini-4-argon")).toBe("Gemini 4 Argon (Antigravity)");
    expect(displayNameForModelId("gpt-oss-120b-medium")).toBe("GPT-OSS 120B (Medium)");
  });
});

describe("collectDiscoveredModels", () => {
  beforeEach(() => {
    vi.mocked(fetchAvailableModels).mockReset();
  });

  it("adds nothing for today's real catalog", async () => {
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      models: Object.fromEntries(MEASURED_CATALOG.map(([id]) => [id, {}])),
    } as never);
    await expect(collectDiscoveredModels("token", "project")).resolves.toEqual({});
  });

  it("adds a newer model when the account has one", async () => {
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      models: { "gemini-3-flash": {}, "gemini-4-argon": {}, "chat_1": {} },
    } as never);
    const discovered = await collectDiscoveredModels("token", "project");
    expect(Object.keys(discovered)).toEqual(["antigravity-gemini-4-argon"]);
  });

  it("degrades to an empty result instead of throwing", async () => {
    vi.mocked(fetchAvailableModels).mockRejectedValue(new Error("fetchAvailableModels failed (403)"));
    await expect(collectDiscoveredModels("token", "project")).resolves.toEqual({});
  });

  it("does nothing without an access token", async () => {
    await expect(collectDiscoveredModels("")).resolves.toEqual({});
    expect(fetchAvailableModels).not.toHaveBeenCalled();
  });
});
