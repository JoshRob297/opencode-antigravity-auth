import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_PROVIDER_ID,
  getAntigravityCliUserAgent,
} from "./constants";
import { DEFAULT_CONFIG } from "./plugin/config/schema";
import { EmptyResponseError } from "./plugin/errors";

vi.mock("./plugin/storage", () => ({
  clearAccounts: vi.fn(async () => {}),
  loadAccounts: vi.fn(async () => ({
    version: 4,
    activeIndex: 0,
    accounts: [
      {
        email: "user@test.com",
        refreshToken: "refresh-token-1",
        projectId: "proj-1",
        managedProjectId: "managed-1",
        addedAt: 1,
        lastUsed: 1,
        enabled: true,
      },
    ],
  })),
  saveAccounts: vi.fn(async () => {}),
  saveAccountsReplace: vi.fn(async () => {}),
}));

vi.mock("./plugin/token", () => ({
  AntigravityTokenRefreshError: class extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
  refreshAccessToken: vi.fn(async (auth: any) => ({
    ...auth,
    access: "fresh-access-token",
    expires: Date.now() + 3600_000,
  })),
}));

vi.mock("./plugin/project", () => ({
  ensureProjectContext: vi.fn(async (auth: any) => ({
    auth,
    effectiveProjectId: "managed-1",
  })),
  invalidateProjectContext: vi.fn(),
  loadManagedProject: vi.fn(),
  onboardManagedProject: vi.fn(),
}));

vi.mock("./plugin/version", () => ({
  initAntigravityVersion: vi.fn(async () => {}),
  initAntigravityCliVersion: vi.fn(async () => {}),
}));

vi.mock("./plugin/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plugin/config")>();
  return {
    ...actual,
    loadConfig: vi.fn(() => ({
      ...DEFAULT_CONFIG,
      empty_response_max_attempts: 4,
      empty_response_retry_delay_ms: 1,
      request_jitter_max_ms: 0,
      proactive_token_refresh: false,
      keep_thinking: false,
      auto_update: false,
      quiet_mode: true,
    })),
    initRuntimeConfig: vi.fn(),
  };
});

vi.mock("./hooks/auto-update-checker", () => ({
  createAutoUpdateCheckerHook: vi.fn(() => ({ event: vi.fn(async () => {}) })),
}));

vi.mock("./plugin/recovery", () => ({
  createSessionRecoveryHook: vi.fn(() => null),
  getRecoverySuccessToast: vi.fn(() => ({ title: "", message: "" })),
}));

vi.mock("./plugin/config/updater", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plugin/config/updater")>();
  return {
    ...actual,
    ensureAntigravityQuotaCommand: vi.fn(),
  };
});

vi.mock("./plugin/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plugin/cache")>();
  return {
    ...actual,
    initDiskSignatureCache: vi.fn(),
    resolveCachedAuth: vi.fn((auth: any) => auth),
    cacheSignature: vi.fn(),
    getCachedSignature: vi.fn(),
  };
});

vi.mock("./plugin/quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./plugin/quota")>();
  return {
    ...actual,
    checkAccountsQuota: vi.fn(async () => []),
    fetchAccountQuotaDetails: vi.fn(async () => ({ index: 0, status: "ok" })),
  };
});

vi.mock("./plugin/stats", () => ({
  EngineStatsManager: {
    getInstance: vi.fn(() => ({
      recordSuccess: vi.fn(),
      recordRateLimit: vi.fn(),
      recordError: vi.fn(),
      getSavedHealthScore: vi.fn(() => undefined),
      getScore: vi.fn(() => 100),
    })),
  },
}));

import { createAntigravityPlugin, verifyAccountAccess, extractToSSuspensionReason } from "./plugin";

function createMockClient() {
  return {
    tui: { showToast: vi.fn(async () => {}) },
    auth: { set: vi.fn(async () => {}) },
    session: { prompt: vi.fn(async () => {}) },
  } as any;
}

describe("v1 plugin empty response retry (2.3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function initFetch() {
    const pluginFactory = createAntigravityPlugin(ANTIGRAVITY_PROVIDER_ID);
    const plugin = await pluginFactory({
      client: createMockClient(),
      directory: "/tmp/nonexistent-plugin-test-dir",
    } as any);

    const authRecord = {
      type: "oauth" as const,
      refresh: "refresh-token-1|proj-1|managed-1",
      access: "fresh-access-token",
      expires: Date.now() + 3600_000,
    };

    const loaderResult = (await plugin.auth.loader(
      async () => authRecord,
      { models: {} } as any,
    )) as { fetch: typeof fetch };

    return loaderResult.fetch;
  }

  it("retries on the same endpoint after 3 empty { candidates: [] } responses and reaches the 4th attempt", async () => {
    const pluginFetch = await initFetch();
    const emptyBody = JSON.stringify({ candidates: [] });
    const validBody = JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }],
    });

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(validBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await pluginFetch(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "hello" }] }],
        }),
      },
    );

    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const url of urls) {
      expect(url.startsWith(ANTIGRAVITY_ENDPOINT_FALLBACKS[0])).toBe(true);
    }
  });

  it("throws EmptyResponseError after 4 empty responses instead of looping across endpoints, and does not leak attempt count to next request", async () => {
    const pluginFetch = await initFetch();
    const emptyBody = JSON.stringify({ candidates: [] });
    const validBody = JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "recovered" }] }, finishReason: "STOP" }],
    });

    let calls = 0;
    const fetchSpy = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls > 10) {
        throw new Error("Runaway empty-response retry loop");
      }
      return new Response(emptyBody, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      pluginFetch(
        "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "req1" }] }],
          }),
        },
      ),
    ).rejects.toThrow(EmptyResponseError);

    expect(fetchSpy).toHaveBeenCalledTimes(4);

    // Next request with identical prompt/session should still get all 4 attempts (3 empty + 1 valid).
    const fetchSpy2 = vi
      .fn()
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(validBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy2);

    const res2 = await pluginFetch(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "req1" }] }],
        }),
      },
    );

    expect(res2.ok).toBe(true);
    expect(fetchSpy2).toHaveBeenCalledTimes(4);
  });
});

describe("extractToSSuspensionReason", () => {
  it("recognizes the account-level Terms of Service suspension", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "This service has been disabled in this account for violation of Terms of Service. Please submit an appeal to continue using this product.",
        status: "PERMISSION_DENIED",
      },
    });

    const reason = extractToSSuspensionReason(body);
    expect(reason).toContain("violation of Terms of Service");
  });

  it("does not treat a validation_required 403 as a suspension", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "Validation Required",
        details: [{ reason: "VALIDATION_REQUIRED", metadata: { validation_url: "https://accounts.google.com/verify" } }],
      },
    });

    expect(extractToSSuspensionReason(body)).toBeUndefined();
  });

  it("ignores rate-limit and quota bodies", () => {
    const body = JSON.stringify({ error: { code: 429, message: "Individual quota reached" } });
    expect(extractToSSuspensionReason(body)).toBeUndefined();
  });

  it("recognizes the account-disabled wording Google has also used", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "Your account has been suspended. Contact support.",
        status: "PERMISSION_DENIED",
      },
    });

    const reason = extractToSSuspensionReason(body);
    expect(reason).toContain("account has been suspended");
  });

  it("does not treat a project-level IAM denial as a suspension", () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "Permission 'cloudaicompanion.instances.completeTask' denied on resource 'projects/rising-fact-p41fc'.",
        status: "PERMISSION_DENIED",
      },
    });

    expect(extractToSSuspensionReason(body)).toBeUndefined();
  });
});

describe("verifyAccountAccess (3.3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("targets ANTIGRAVITY_ENDPOINT_FALLBACKS[0] (not PROD), uses CLI User-Agent, omits x-goog-user-project, and uses an active model", async () => {
    const fetchSpy = vi.fn(async () => new Response("data: {}\n\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyAccountAccess(
      {
        refreshToken: "refresh-token-1|proj-1|managed-1",
        email: "user@test.com",
        projectId: "proj-1",
        managedProjectId: "managed-1",
      },
      createMockClient(),
      ANTIGRAVITY_PROVIDER_ID,
    );

    expect(result.status).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(ANTIGRAVITY_ENDPOINT_FALLBACKS[0])).toBe(true);
    expect(url).not.toContain(ANTIGRAVITY_ENDPOINT_PROD);

    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(getAntigravityCliUserAgent());
    expect(headers["x-goog-user-project"]).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.model).not.toBe("gemini-3-flash");
    expect(body.model).toBe("gemini-3.8-flash-low");
  });
});
