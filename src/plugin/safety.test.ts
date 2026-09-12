import { describe, expect, it } from "vitest";
import { buildSafetySettings, prepareAntigravityRequest } from "./request";

describe("Safety Settings Configuration (buildSafetySettings)", () => {
  it("defaults to medium (Google native baseline threshold BLOCK_MEDIUM_AND_ABOVE without JAILBREAK)", () => {
    const settings = buildSafetySettings();
    expect(settings).toHaveLength(5);
    expect(settings).toEqual([
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ]);
  });

  it("builds high threshold settings (BLOCK_ONLY_HIGH)", () => {
    const settings = buildSafetySettings("high");
    expect(settings).toHaveLength(5);
    expect(settings).toEqual([
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_ONLY_HIGH" },
    ]);
  });

  it("builds none threshold settings (BLOCK_NONE + HARM_CATEGORY_JAILBREAK)", () => {
    const settings = buildSafetySettings("none");
    expect(settings).toHaveLength(6);
    expect(settings).toEqual([
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_JAILBREAK", threshold: "BLOCK_NONE" },
    ]);
  });

  it("injects configured safetyLevel into prepareAntigravityRequest payload", () => {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
    };

    // Medium by default
    const reqDefault = prepareAntigravityRequest(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:streamGenerateContent",
      init,
      "fake-token",
      "fake-project",
      undefined,
      "antigravity",
      false,
      { safetyLevel: "medium" }
    );
    const parsedDefault = JSON.parse(reqDefault.init.body as string);
    expect(parsedDefault.request.safetySettings).toEqual(buildSafetySettings("medium"));

    // None when requested
    const reqNone = prepareAntigravityRequest(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:streamGenerateContent",
      init,
      "fake-token",
      "fake-project",
      undefined,
      "antigravity",
      false,
      { safetyLevel: "none" }
    );
    const parsedNone = JSON.parse(reqNone.init.body as string);
    expect(parsedNone.request.safetySettings).toEqual(buildSafetySettings("none"));
  });

  it("preserves user-provided custom safetySettings if already present in body", () => {
    const customSettings = [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" }];
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        safetySettings: customSettings,
      }),
    };

    const req = prepareAntigravityRequest(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:streamGenerateContent",
      init,
      "fake-token",
      "fake-project",
      undefined,
      "antigravity",
      false,
      { safetyLevel: "none" }
    );
    const parsed = JSON.parse(req.init.body as string);
    expect(parsed.request.safetySettings).toEqual(customSettings);
  });
});
