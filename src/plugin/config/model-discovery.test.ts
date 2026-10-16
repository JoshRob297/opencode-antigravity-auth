import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../quota", () => ({
  fetchAvailableModels: vi.fn(),
}));

import { fetchAvailableModels } from "../quota";
import {
  buildDiscoveredModelDefinition,
  buildDiscoveredModels,
  collectDiscoveredModels,
  displayNameForModelId,
  isDiscoverableModelId,
} from "./model-discovery";

/**
 * Real catalog returned by `fetchAvailableModels` for a consumer account
 * (measured 2026-10-15), with the verdict each id got when probed through the
 * plugin's own request envelope.
 */
const MEASURED_CATALOG: Array<[id: string, verdict: string]> = [
  ["chat_20706", "http400"],
  ["chat_23310", "http400"],
  ["claude-opus-4-6-thinking", "OK"],
  ["claude-sonnet-4-6", "OK"],
  ["gemini-2.5-flash", "OK"],
  ["gemini-2.5-flash-lite", "OK"],
  ["gemini-2.5-flash-thinking", "OK"],
  ["gemini-2.5-pro", "503"],
  ["gemini-3-flash", "OK"],
  ["gemini-3-flash-agent", "RETIRED"],
  ["gemini-3.1-flash-image", "image"],
  ["gemini-3.1-flash-lite", "OK"],
  ["gemini-3.1-pro-high", "404"],
  ["gemini-3.1-pro-low", "404"],
  ["gemini-3.5-flash-extra-low", "404"],
  ["gemini-3.5-flash-lite", "OK"],
  ["gemini-3.5-flash-low", "RETIRED"],
  ["gemini-3.6-flash-high", "404"],
  ["gemini-3.6-flash-low", "404"],
  ["gemini-3.6-flash-medium", "404"],
  ["gemini-3.8-flash-tiered", "tiered"],
  ["gemini-pro-agent", "404"],
  ["gpt-oss-120b-medium", "OK"],
  ["tab_flash_lite_preview", "internal"],
  ["tab_jump_flash_lite_preview", "internal"],
];

describe("model discovery filters", () => {
  it("surfaces the measured usable ids and nothing else", () => {
    const discovered = buildDiscoveredModels(MEASURED_CATALOG.map(([id]) => id));
    expect(Object.keys(discovered).sort()).toEqual(
      [
        "antigravity-claude-opus-4-6-thinking",
        "antigravity-claude-sonnet-4-6",
        "antigravity-gemini-2.5-flash",
        "antigravity-gemini-2.5-flash-lite",
        "antigravity-gemini-2.5-flash-thinking",
        "antigravity-gemini-3-flash",
        "antigravity-gemini-3.1-flash-lite",
        "antigravity-gemini-3.5-flash-lite",
        "antigravity-gpt-oss-120b-medium",
      ].sort(),
    );
  });

  it.each(MEASURED_CATALOG.filter(([, verdict]) => verdict !== "OK"))(
    "never surfaces %s",
    (id) => {
      expect(isDiscoverableModelId(id)).toBe(false);
    },
  );

  it.each(MEASURED_CATALOG.filter(([, verdict]) => verdict === "OK"))(
    "surfaces %s",
    (id) => {
      expect(isDiscoverableModelId(id)).toBe(true);
    },
  );

  it("surfaces the Gemini 4 Argon family when the account has it", () => {
    expect(isDiscoverableModelId("gemini-4-argon")).toBe(true);
    expect(isDiscoverableModelId("gemini-4-argon-high")).toBe(true);
    expect(buildDiscoveredModels(["gemini-4-argon"])["antigravity-gemini-4-argon"]).toBeDefined();
  });

  it("rejects unknown families and malformed ids", () => {
    expect(isDiscoverableModelId("definitely-not-a-model-xyz")).toBe(false);
    expect(isDiscoverableModelId("gemini-4-argon-image")).toBe(false);
    expect(isDiscoverableModelId("")).toBe(false);
    expect(isDiscoverableModelId("   ")).toBe(false);
  });
});

describe("model discovery definitions", () => {
  it("gives Gemini ids Gemini limits and thinking variants", () => {
    const def = buildDiscoveredModelDefinition("gemini-3-flash");
    expect(def.limit).toEqual({ context: 1048576, output: 65536 });
    expect(def.variants?.low).toEqual({ thinkingLevel: "low" });
    expect(def.variants?.high).toEqual({ thinkingLevel: "high" });
    expect(def.modalities).toEqual({ input: ["text", "image", "pdf"], output: ["text"] });
  });

  it("gives Claude thinking ids Claude limits and thinking budgets", () => {
    const def = buildDiscoveredModelDefinition("gemini-4-argon");
    expect(def.variants?.medium).toEqual({ thinkingLevel: "medium" });

    const claude = buildDiscoveredModelDefinition("claude-sonnet-5-thinking");
    expect(claude.limit).toEqual({ context: 200000, output: 64000 });
    expect(claude.variants?.max).toEqual({ thinkingConfig: { thinkingBudget: 32768 } });
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

  it("returns the filtered catalog for the account", async () => {
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      models: Object.fromEntries(MEASURED_CATALOG.map(([id]) => [id, {}])),
    } as never);
    const discovered = await collectDiscoveredModels("token", "project");
    expect(discovered["antigravity-gemini-3-flash"]).toBeDefined();
    expect(discovered["antigravity-gemini-3.6-flash-high"]).toBeUndefined();
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
