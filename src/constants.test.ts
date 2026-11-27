import { describe, it, expect } from "vitest";
import {
  getRandomizedHeaders,
  ANTIGRAVITY_HEADERS,
  ANTIGRAVITY_ENDPOINT_DAILY,
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_CLI_VERSION_FALLBACK,
  getAntigravityCliUserAgent,
  getAntigravityCliBuild,
  type HeaderSet,
} from "./constants.ts";

describe("CLI client signature", () => {
  it("ships the version and build id agy 1.5.18 reports", () => {
    expect(ANTIGRAVITY_CLI_VERSION_FALLBACK).toBe("1.5.18");
    expect(getAntigravityCliBuild()).toBe("1030252320");
    expect(getAntigravityCliUserAgent()).toBe(
      "antigravity/cli/1.5.18 (aidev_client; os_type=linux; arch=amd64; cl=1030252320; auth_method=consumer)",
    );
  });
});

describe("ANTIGRAVITY_ENDPOINT_FALLBACKS", () => {
  it("tries the daily production host first and leaves the sandbox last", () => {
    expect(ANTIGRAVITY_ENDPOINT_FALLBACKS[0]).toBe("https://daily-cloudcode-pa.googleapis.com");
    expect(ANTIGRAVITY_ENDPOINT_FALLBACKS).toContain(ANTIGRAVITY_ENDPOINT_PROD);
    expect(ANTIGRAVITY_ENDPOINT_FALLBACKS[ANTIGRAVITY_ENDPOINT_FALLBACKS.length - 1]).toBe(
      ANTIGRAVITY_ENDPOINT_DAILY,
    );
  });
});

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
