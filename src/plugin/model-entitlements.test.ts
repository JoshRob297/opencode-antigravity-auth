import { describe, expect, it } from "vitest";

import {
  buildAccountModelCatalog,
  catalogAllowsModel,
  normalizeRequestedModelId,
} from "./model-entitlements";

/** Shape measured on 2026-10-31 for an account with the Gemini 4 "Argon" grant. */
const ARGON_ACCOUNT_RESPONSE = {
  models: {
    "gemini-4-argon-low": {
      displayName: "Gemini 4 Argon (Low)",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
      quotaInfo: { remainingFraction: 0.98, resetTime: "2026-11-07T01:37:26Z" },
    },
    "gemini-4-argon-medium": {
      displayName: "Gemini 4 Argon (Medium)",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
      quotaInfo: { remainingFraction: 0.98, resetTime: "2026-11-07T01:37:26Z" },
    },
    "gemini-4-argon-high": {
      displayName: "Gemini 4 Argon (High)",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
      quotaInfo: { remainingFraction: 0.98, resetTime: "2026-11-07T01:37:26Z" },
    },
    "claude-sonnet-5-5-medium": {
      displayName: "Claude Sonnet 5.5 (Medium)",
      maxTokens: 1000000,
      maxOutputTokens: 128000,
      quotaInfo: { remainingFraction: 0.99, resetTime: "2026-10-31T06:38:02Z" },
    },
    "gemini-3.8-flash-high": {
      displayName: "Gemini 3.8 Flash (High)",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
      quotaInfo: { remainingFraction: 0.98, resetTime: "2026-10-31T06:40:03Z" },
    },
    "gemini-3.8-flash-tiered": { displayName: "undefined", maxTokens: 1048576 },
    "chat_20706": { maxTokens: 16384, quotaInfo: { remainingFraction: 1 } },
  },
};

/** Shape measured on 2026-10-31 for a Free / AI Plus account. */
const FREE_ACCOUNT_RESPONSE = {
  models: {
    "gemini-4-argon-disabled": {
      displayName: "Gemini 4 Argon",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
    },
    "gemini-3.8-flash-high": {
      displayName: "Gemini 3.8 Flash (High)",
      maxTokens: 1048576,
      maxOutputTokens: 65536,
      quotaInfo: { resetTime: "2026-10-31T14:46:06Z" },
    },
    "claude-sonnet-4-6": {
      displayName: "Claude Sonnet 4.6 (Thinking)",
      maxTokens: 250000,
      maxOutputTokens: 64000,
      quotaInfo: { remainingFraction: 0.95, resetTime: "2026-10-31T06:25:30Z" },
    },
  },
};

describe("buildAccountModelCatalog", () => {
  it("keeps every id with a quotaInfo block and their declared limits", () => {
    const catalog = buildAccountModelCatalog(ARGON_ACCOUNT_RESPONSE);

    expect(Object.keys(catalog.models).sort()).toEqual([
      "chat_20706",
      "claude-sonnet-5-5-medium",
      "gemini-3.8-flash-high",
      "gemini-4-argon-high",
      "gemini-4-argon-low",
      "gemini-4-argon-medium",
    ]);
    expect(catalog.models["claude-sonnet-5-5-medium"]).toEqual({
      displayName: "Claude Sonnet 5.5 (Medium)",
      maxTokens: 1000000,
      maxOutputTokens: 128000,
      remainingFraction: 0.99,
      resetTime: "2026-10-31T06:38:02Z",
    });
    // No quotaInfo (the `-tiered` alias in the measured payload) is not usable.
    expect(catalog.models["gemini-3.8-flash-tiered"]).toBeUndefined();
  });

  it("drops the -disabled placeholder a non-entitled account receives", () => {
    const catalog = buildAccountModelCatalog(FREE_ACCOUNT_RESPONSE);
    expect(catalog.models["gemini-4-argon-disabled"]).toBeUndefined();
    expect(Object.keys(catalog.models).sort()).toEqual([
      "claude-sonnet-4-6",
      "gemini-3.8-flash-high",
    ]);
  });

  it("survives a malformed response", () => {
    expect(buildAccountModelCatalog(null).models).toEqual({});
    expect(buildAccountModelCatalog({ models: { "": {} } }).models).toEqual({});
  });
});

describe("normalizeRequestedModelId", () => {
  it("strips the antigravity prefix and preview suffixes", () => {
    expect(normalizeRequestedModelId("antigravity-gemini-4-argon-medium")).toEqual([
      "antigravity-gemini-4-argon-medium",
      "gemini-4-argon-medium",
    ]);
    expect(normalizeRequestedModelId("gemini-3-pro-preview")).toContain("gemini-3-pro");
    expect(normalizeRequestedModelId("  ")).toEqual([]);
  });
});

describe("catalogAllowsModel", () => {
  const argon = buildAccountModelCatalog(ARGON_ACCOUNT_RESPONSE);
  const free = buildAccountModelCatalog(FREE_ACCOUNT_RESPONSE);

  it("allows a model the account measured", () => {
    expect(catalogAllowsModel(argon, "antigravity-gemini-4-argon-medium")).toBe(true);
    expect(catalogAllowsModel(argon, "claude-sonnet-5-5")).toBe(true);
    expect(catalogAllowsModel(free, "antigravity-gemini-3.8-flash")).toBe(true);
  });

  it("rejects a model the account measured as absent", () => {
    expect(catalogAllowsModel(free, "antigravity-gemini-4-argon")).toBe(false);
    expect(catalogAllowsModel(free, "claude-sonnet-5-5")).toBe(false);
  });

  it("matches a family id against the concrete tiered ids", () => {
    // The selector now registers one entry per family (`antigravity-claude-sonnet-5-5`)
    // while the catalog lists the per-tier ids.
    expect(catalogAllowsModel(argon, "antigravity-claude-sonnet-5-5")).toBe(true);
    expect(catalogAllowsModel(argon, "gemini-3.8-flash")).toBe(true);
  });

  it("never blocks on an unmeasured or stale catalog", () => {
    expect(catalogAllowsModel(undefined, "gemini-4-argon")).toBe("unknown");
    expect(catalogAllowsModel({ updatedAt: Date.now(), models: {} }, "gemini-4-argon")).toBe("unknown");
    const stale = { ...argon, updatedAt: Date.now() - 60 * 60 * 1000 };
    expect(catalogAllowsModel(stale, "gemini-4-argon")).toBe("unknown");
  });

  it("treats an empty model id as unknown", () => {
    expect(catalogAllowsModel(argon, "")).toBe("unknown");
  });
});
