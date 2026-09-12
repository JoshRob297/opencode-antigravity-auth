import { describe, it, expect } from "vitest";
import {
  getRandomizedHeaders,
  ANTIGRAVITY_HEADERS,
  type HeaderSet,
} from "./constants.ts";

describe("ANTIGRAVITY_HEADERS", () => {
  it("matches Antigravity header structure", () => {
    expect(ANTIGRAVITY_HEADERS["User-Agent"]).toContain("Antigravity/");
    expect(ANTIGRAVITY_HEADERS["X-Goog-Api-Client"]).toBe("google-cloud-sdk vscode_cloudshelleditor/0.1");
    expect(ANTIGRAVITY_HEADERS["Client-Metadata"]).toContain("ANTIGRAVITY");
  });
});

describe("getRandomizedHeaders", () => {
  describe("antigravity style", () => {
    it("returns all three headers", () => {
      const headers = getRandomizedHeaders("antigravity");
      expect(headers["User-Agent"]).toBeDefined();
      expect(headers["X-Goog-Api-Client"]).toBeDefined();
      expect(headers["Client-Metadata"]).toBeDefined();
    });

    it("returns User-Agent in antigravity format", () => {
      const headers = getRandomizedHeaders("antigravity");
      expect(headers["User-Agent"]).toMatch(/^antigravity\//);
    });

    it("aligns Client-Metadata platform with User-Agent platform", () => {
      for (let i = 0; i < 50; i++) {
        const headers = getRandomizedHeaders("antigravity");
        const ua = headers["User-Agent"]!;
        const meta = headers["Client-Metadata"]!;

        if (ua.includes("windows")) {
          expect(meta).toContain('"platform":"WINDOWS"');
        } else if (ua.includes("darwin")) {
          expect(meta).toContain('"platform":"MACOS"');
        }
      }
    });
  });
});
