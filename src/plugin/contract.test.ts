import { describe, expect, it } from "vitest";

import {
  ANTIGRAVITY_CLI_VERSION_FALLBACK,
  getAntigravityCliBuild,
  getAntigravityCliUserAgent,
  getKnownCliVersions,
} from "../constants";
import { prepareAntigravityRequest } from "./request";

const ACCESS_TOKEN = "token";
const PROJECT = "project";

function build(model: string) {
  return prepareAntigravityRequest(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
    },
    ACCESS_TOKEN,
    PROJECT,
    undefined,
    "antigravity",
  );
}

/**
 * Golden contract for the Antigravity body. If this test breaks, the request
 * stopped looking like the official client and must be checked against a live
 * capture before the change ships.
 */
describe("Antigravity request contract", () => {
  it("wraps the body with the six keys the CLI sends", () => {
    const prepared = build("gemini-3.8-flash-high");
    const body = JSON.parse(String(prepared.init.body));

    expect(Object.keys(body).sort()).toEqual([
      "model",
      "project",
      "request",
      "requestId",
      "requestType",
      "userAgent",
    ]);
    expect(body.project).toBe(PROJECT);
    expect(body.userAgent).toBe("antigravity");
    expect(body.requestType).toBe("agent");
  });

  it("keeps the CLI request id shape", () => {
    const prepared = build("gemini-3.8-flash-high");
    const body = JSON.parse(String(prepared.init.body));

    expect(body.requestId).toMatch(
      /^agent\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{13}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/1$/,
    );
  });

  it("sends the CLI signature and none of the rejected google headers", () => {
    const prepared = build("gemini-3.8-flash-high");
    const headers = new Headers(prepared.init.headers);

    expect(headers.get("user-agent")).toBe(getAntigravityCliUserAgent());
    expect(headers.get("user-agent")).toContain(`cl=${getAntigravityCliBuild()}`);
    expect(headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-goog-api-key")).toBeNull();
    expect(headers.get("x-goog-user-project")).toBeNull();
    expect(headers.get("x-goog-api-client")).toBeNull();
    expect(headers.get("client-metadata")).toBeNull();
  });

  it("pairs every known CLI version with a numeric build id", () => {
    const known = getKnownCliVersions();
    expect(known).toContain(ANTIGRAVITY_CLI_VERSION_FALLBACK);
    expect(known.length).toBeGreaterThan(1);
    expect(getAntigravityCliBuild()).toMatch(/^\d+$/);
  });
});
