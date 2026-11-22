import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression: empty `200` responses must not consume the endpoint budget.
 *
 * The retry used `continue` inside the endpoint `for` loop, so every empty body
 * advanced to the next endpoint. With three endpoints and
 * `empty_response_max_attempts: 4`, three empty bodies ended the loop with
 * `lastFailure`/`lastError` still null and the caller saw
 * "All Antigravity accounts failed" instead of the fourth attempt.
 */

vi.mock("./version", () => ({
  initAntigravityVersion: async () => {},
  initAntigravityCliVersion: async () => {},
}));

vi.mock("./config/updater", () => ({
  ensureAntigravityQuotaCommand: () => {},
}));

vi.mock("./project", () => ({
  ensureProjectContext: async (auth: unknown) => ({
    auth,
    effectiveProjectId: "test-project",
  }),
  invalidateProjectContext: () => {},
  loadManagedProject: async () => null,
  onboardManagedProject: async () => null,
}));

const storedAccount = {
  refreshToken: "refresh-token",
  projectId: "test-project",
  addedAt: 1,
  lastUsed: 0,
};

vi.mock("./storage", () => ({
  loadAccounts: async () => ({
    version: 4,
    accounts: [storedAccount],
    activeIndex: 0,
  }),
  saveAccounts: async () => {},
  clearAccounts: async () => {},
  saveAccountsReplace: async () => {},
  ensureGitignoreSync: () => {},
}));

import { createAntigravityPlugin } from "../plugin";
import { formatRefreshParts } from "./auth";
import type { PluginClient } from "./types";

const MODEL_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

function writeConfig(directory: string, config: Record<string, unknown>): void {
  const dir = join(directory, ".opencode");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "antigravity.json"), JSON.stringify(config));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const emptyBody = { candidates: [] };
const answerBody = {
  response: {
    candidates: [{ content: { role: "model", parts: [{ text: "PONG" }] }, finishReason: "STOP" }],
  },
};

describe("empty-response retry across endpoint fallbacks", () => {
  beforeEach(() => {
    process.env.OPENCODE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "agy-config-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENCODE_CONFIG_DIR;
  });

  it("keeps retrying the same endpoint until the fourth attempt instead of failing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "agy-project-"));
    writeConfig(directory, {
      quiet_mode: true,
      proactive_token_refresh: false,
      empty_response_max_attempts: 4,
      empty_response_retry_delay_ms: 500,
    });

    const client = {
      auth: { set: vi.fn(async () => {}) },
      tui: { showToast: vi.fn(async () => {}) },
      app: { log: vi.fn(async () => {}) },
    } as unknown as PluginClient;

    const auth = {
      type: "oauth" as const,
      refresh: formatRefreshParts({ refreshToken: storedAccount.refreshToken, projectId: "test-project" }),
      access: "access-token",
      expires: Date.now() + 60 * 60 * 1000,
    };

    const modelCalls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes(":generateContent")) {
        modelCalls.push(url);
        const isFourth = modelCalls.length === 4;
        return jsonResponse(isFourth ? answerBody : emptyBody);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const plugin = await createAntigravityPlugin("google")({ client, directory });
    const loader = (plugin.auth as { loader: (...args: unknown[]) => Promise<any> }).loader;
    const result = await loader(
      async () => auth,
      { models: {} },
    );

    const response = await result.fetch(MODEL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
      }),
    });

    const text = await response.text();
    expect(response.ok).toBe(true);
    expect(modelCalls).toHaveLength(4);
    expect(text).toContain("PONG");
  }, 20_000);
});
