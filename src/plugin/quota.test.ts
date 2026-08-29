import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDuration,
  progressBar,
  shortEmail,
  formatQuotaReportMarkdown,
  fetchQuotaSummary,
  fetchAvailableModels,
  fetchAccountQuotaDetails,
  checkAccountsQuota,
  type AccountQuotaResult,
} from "./quota";
import type { AccountMetadataV3 } from "./storage";
import type { PluginClient } from "./types";

vi.mock("./token", () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("./project", () => ({
  ensureProjectContext: vi.fn(),
}));

vi.mock("./debug", () => ({
  logQuotaFetch: vi.fn(),
}));

import { refreshAccessToken } from "./token";
import { ensureProjectContext } from "./project";
import { logQuotaFetch } from "./debug";

function createMockClient(): PluginClient {
  return {
    auth: {
      set: vi.fn(async () => {}),
    },
  } as unknown as PluginClient;
}

describe("quota formatting utils", () => {
  it("formats durations accurately", () => {
    expect(formatDuration(45 * 1000)).toBe("0m");
    expect(formatDuration(120 * 1000)).toBe("2m");
    expect(formatDuration(3600 * 1000 + 15 * 60 * 1000)).toBe("1h 15m");
    expect(formatDuration(24 * 3600 * 1000 * 2 + 5 * 3600 * 1000)).toBe("2d 5h");
  });

  it("shortens emails cleanly", () => {
    expect(shortEmail("user123@gmail.com")).toBe("user123");
    expect(shortEmail("admin@company.org")).toBe("admin");
    expect(shortEmail("")).toBe("");
  });

  it("builds progress bars correctly", () => {
    expect(progressBar(100)).toBe("[██████████] 100%");
    expect(progressBar(50)).toBe("[█████░░░░░] 50%");
    expect(progressBar(0)).toBe("[░░░░░░░░░░] 0%");
    expect(progressBar(-10)).toBe("[░░░░░░░░░░] 0%");
    expect(progressBar(150)).toBe("[██████████] 100%");
  });
});

describe("fetchQuotaSummary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct POST request with authorization headers and body", async () => {
    const mockResponseData = {
      groups: [
        {
          displayName: "Gemini Models",
          buckets: [{ window: "5h", remainingFraction: 0.9 }],
        },
      ],
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/v1internal:retrieveUserQuotaSummary");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-access-token");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["User-Agent"]).toBeDefined();
      expect(JSON.parse(init?.body as string)).toEqual({ project: "my-project" });

      return new Response(JSON.stringify(mockResponseData), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchQuotaSummary("test-access-token", "my-project");
    expect(result).toEqual(mockResponseData);
  });

  it("sends empty body if projectId is not provided", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(init?.body as string)).toEqual({});
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchQuotaSummary("test-access-token");
    expect(result).toEqual({});
  });

  it("throws error when response status is not ok (e.g. 403)", async () => {
    global.fetch = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    }) as unknown as typeof fetch;

    await expect(fetchQuotaSummary("test-access-token")).rejects.toThrow(
      "retrieveUserQuotaSummary failed (403)",
    );
  });

  it("propagates network errors/rejections", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    await expect(fetchQuotaSummary("test-access-token")).rejects.toThrow("Network error");
  });
});

describe("fetchAvailableModels", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct POST request with authorization headers and body", async () => {
    const mockResponseData = {
      models: {
        "gemini-3.1-pro": {
          displayName: "Gemini 3.1 Pro",
          quotaInfo: { remainingFraction: 0.8 },
        },
      },
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/v1internal:fetchAvailableModels");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-access-token");
      expect(JSON.parse(init?.body as string)).toEqual({ project: "proj-123" });

      return new Response(JSON.stringify(mockResponseData), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchAvailableModels("test-access-token", "proj-123");
    expect(result).toEqual(mockResponseData);
  });

  it("throws error when response status is not ok (e.g. 500)", async () => {
    global.fetch = vi.fn(async () => {
      return new Response("Server Error", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(fetchAvailableModels("test-access-token")).rejects.toThrow(
      "fetchAvailableModels failed (500)",
    );
  });
});

describe("fetchAccountQuotaDetails", () => {
  const mockClient = createMockClient();
  const baseAccount: AccountMetadataV3 = {
    email: "user@test.com",
    refreshToken: "token123",
    projectId: "proj1",
    managedProjectId: "managed1",
    enabled: true,
    addedAt: Date.now(),
    lastUsed: Date.now(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes access token if expired and updates auth", async () => {
    const expiredAccount: AccountMetadataV3 = { ...baseAccount };

    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      type: "oauth",
      access: "new-access",
      refresh: "new-token123|proj2|managed2",
      expires: Date.now() + 3600000,
    });

    vi.mocked(ensureProjectContext).mockResolvedValueOnce({
      auth: {
        type: "oauth",
        access: "new-access",
        refresh: "new-token123|proj2|managed2",
        expires: Date.now() + 3600000,
      },
      effectiveProjectId: "proj2",
    });

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("retrieveUserQuotaSummary")) {
        return new Response(
          JSON.stringify({
            groups: [
              {
                displayName: "Gemini Models",
                buckets: [
                  {
                    window: "5h",
                    remainingFraction: 0.75,
                    resetTime: new Date(Date.now() + 1800000).toISOString(),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(expiredAccount, 0, mockClient);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    expect(result.updatedAccount).toEqual({
      ...expiredAccount,
      refreshToken: "new-token123",
      projectId: "proj2",
      managedProjectId: "managed2",
    });
    expect(result.cachedQuota?.["gemini-flash"]?.remainingFraction).toBe(0.75);
    expect(result.cachedQuota?.["gemini-pro"]?.remainingFraction).toBe(0.75);
  });

  it("handles empty refresh token in auth when updating account", async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      type: "oauth",
      access: "new-access",
      refresh: "",
      expires: Date.now() + 3600000,
    });

    vi.mocked(ensureProjectContext).mockResolvedValueOnce({
      auth: {
        type: "oauth",
        access: "new-access",
        refresh: "",
        expires: Date.now() + 3600000,
      },
      effectiveProjectId: "p1",
    });

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          groups: [
            {
              displayName: "Gemini",
              buckets: [{ window: "5h", remainingFraction: 0.5 }],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(baseAccount, 0, mockClient);

    expect(result.status).toBe("ok");
    expect(result.updatedAccount).toBeUndefined();
  });

  it("handles token refresh failure gracefully returning error status", async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce(undefined);

    const result = await fetchAccountQuotaDetails(baseAccount, 0, mockClient);

    expect(result.status).toBe("error");
    expect(result.error).toBe("Token refresh failed");
    expect(result.disabled).toBe(false);
  });

  it("handles disabled account status and non-finite fraction values", async () => {
    const disabledAccount: AccountMetadataV3 = { ...baseAccount, enabled: false };

    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      type: "oauth",
      access: "access",
      refresh: "token123",
      expires: Date.now() + 3600000,
    });

    vi.mocked(ensureProjectContext).mockResolvedValueOnce({
      auth: {
        type: "oauth",
        access: "access",
        refresh: "token123",
        expires: Date.now() + 3600000,
      },
      effectiveProjectId: "p1",
    });

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          groups: [
            {
              displayName: "Claude & GPT",
              buckets: [
                {
                  window: "weekly",
                  remainingFraction: 1.5,
                  resetTime: "invalid-date-string",
                },
                {
                  window: "5h",
                  remainingFraction: undefined,
                  resetTime: undefined,
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(disabledAccount, 1, mockClient);

    expect(result.status).toBe("disabled");
    expect(result.disabled).toBe(true);
    expect(result.groups?.[0]?.weekly?.remainingFraction).toBe(1);
    expect(result.groups?.[0]?.fiveHour?.remainingFraction).toBe(0);
    expect(result.cachedQuota?.claude?.remainingFraction).toBe(0);
  });

  it("falls back to fetchAvailableModels when retrieveUserQuotaSummary throws", async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      type: "oauth",
      access: "access",
      refresh: "token123",
      expires: Date.now() + 3600000,
    });

    vi.mocked(ensureProjectContext).mockResolvedValueOnce({
      auth: { type: "oauth", access: "access", refresh: "token123" },
      effectiveProjectId: "p1",
    });

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("retrieveUserQuotaSummary")) {
        return new Response("Not Found", { status: 404 });
      }
      if (url.includes("fetchAvailableModels")) {
        return new Response(
          JSON.stringify({
            models: {
              "gemini-3.7-flash": {
                displayName: "Gemini 3.7 Flash",
                quotaInfo: {
                  remainingFraction: 0.5,
                  resetTime: new Date(Date.now() + 7200000).toISOString(),
                },
                recommended: true,
                tagTitle: "Fast",
              },
              "claude-opus-4-6": {
                displayName: "Claude Opus 4.6",
                quotaInfo: {
                  remainingFraction: 0.2,
                  resetTime: "invalid-date",
                },
              },
              "gemini-3.1-pro": {
                displayName: "Gemini 3.1 Pro",
                quotaInfo: {
                  remainingFraction: 0.9,
                  resetTime: undefined,
                },
              },
              "unsupported-model": {
                displayName: "GPT-4",
                quotaInfo: { remainingFraction: 1 },
              },
              "no-quota-model": {
                displayName: "Gemini 3.5 Flash",
                quotaInfo: undefined,
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(baseAccount, 0, mockClient);

    expect(result.status).toBe("ok");
    expect(result.models?.length).toBe(3);
    expect(result.cachedQuota?.["gemini-flash"]?.remainingFraction).toBe(0.5);
    expect(result.cachedQuota?.claude?.remainingFraction).toBe(0.2);
    expect(result.cachedQuota?.["gemini-pro"]?.remainingFraction).toBe(0.9);
  });

  it("handles fallback fetchAvailableModels returning empty or missing models object", async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      type: "oauth",
      access: "access",
      refresh: "token123",
      expires: Date.now() + 3600000,
    });

    vi.mocked(ensureProjectContext).mockResolvedValueOnce({
      auth: { type: "oauth", access: "access", refresh: "token123" },
      effectiveProjectId: "p1",
    });

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("retrieveUserQuotaSummary")) {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("fetchAvailableModels")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(baseAccount, 0, mockClient);

    expect(result.status).toBe("ok");
    expect(result.models).toEqual([]);
  });

  it("catches non-Error exceptions in fetchAccountQuotaDetails", async () => {
    vi.mocked(refreshAccessToken).mockImplementationOnce(() => {
      throw "String error occurred";
    });

    const result = await fetchAccountQuotaDetails(baseAccount, 0, mockClient);

    expect(result.status).toBe("error");
    expect(result.error).toBe("String error occurred");
  });
});

describe("checkAccountsQuota", () => {
  it("iterates all accounts and calls logQuotaFetch", async () => {
    const client = createMockClient();
    const accounts: AccountMetadataV3[] = [
      { email: "acc1@test.com", refreshToken: "t1", addedAt: 0, lastUsed: 0 },
      { email: "acc2@test.com", refreshToken: "t2", addedAt: 0, lastUsed: 0 },
    ];

    vi.mocked(refreshAccessToken).mockResolvedValue({
      type: "oauth",
      access: "acc",
      refresh: "t",
      expires: Date.now() + 3600000,
    });
    vi.mocked(ensureProjectContext).mockResolvedValue({
      auth: { type: "oauth", access: "acc", refresh: "t" },
      effectiveProjectId: "p1",
    });
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ groups: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const results = await checkAccountsQuota(accounts, client);

    expect(logQuotaFetch).toHaveBeenCalledWith("start", 2);
    expect(results.length).toBe(2);
    expect(results[0]?.email).toBe("acc1@test.com");
    expect(results[1]?.email).toBe("acc2@test.com");
  });
});

describe("formatQuotaReportMarkdown", () => {
  it("handles empty results gracefully", () => {
    const report = formatQuotaReportMarkdown([]);
    expect(report).toBe("# ☁️ Antigravity Quota Status\n\nNo accounts configured.\n");
  });

  it("formats dual-window markdown report cleanly with errors, disabled accounts, and sorting", () => {
    const results: AccountQuotaResult[] = [
      {
        index: 0,
        email: "alpha@gmail.com",
        status: "ok",
        disabled: false,
        groups: [
          {
            displayName: "Gemini Models",
            fiveHour: {
              window: "5h",
              displayName: "5h Limit",
              remainingPercentage: 85,
              remainingFraction: 0.85,
              resetTime: new Date(Date.now() + 3600000),
              timeUntilReset: 3600000,
              timeUntilResetFormatted: "1h 0m",
            },
            weekly: {
              window: "weekly",
              displayName: "Weekly Limit",
              remainingPercentage: 60,
              remainingFraction: 0.6,
              resetTime: new Date(Date.now() + 86400000 * 3),
              timeUntilReset: 86400000 * 3,
              timeUntilResetFormatted: "3d 0h",
            },
          },
        ],
      },
      {
        index: 1,
        email: "beta@gmail.com",
        status: "disabled",
        disabled: true,
        groups: [
          {
            displayName: "Claude & GPT Models",
            fiveHour: undefined,
            weekly: {
              window: "weekly",
              displayName: "Weekly Limit",
              remainingPercentage: 90,
              remainingFraction: 0.9,
              resetTime: new Date(Date.now() + 86400000),
              timeUntilReset: 86400000,
              timeUntilResetFormatted: "1d 0h",
            },
          },
        ],
      },
      {
        index: 2,
        email: undefined,
        status: "ok",
        groups: [
          {
            displayName: "Custom Provider",
            fiveHour: {
              window: "5h",
              displayName: "5h Limit",
              remainingPercentage: 20,
              remainingFraction: 0.2,
              resetTime: new Date(Date.now() + 1800000),
              timeUntilReset: 1800000,
              timeUntilResetFormatted: "30m",
            },
            weekly: undefined,
          },
        ],
      },
      {
        index: 3,
        email: "err@gmail.com",
        status: "error",
        error: "403 Forbidden",
      },
    ];

    const report = formatQuotaReportMarkdown(results);
    expect(report).toContain("# ☁️ Antigravity Quota Status");
    expect(report).toContain("🤖 Gemini Models (Flash / Pro)");
    expect(report).toContain("🧠 Claude & GPT Models (Opus / Sonnet / GPT-OSS)");
    expect(report).toContain("### Custom Provider");
    expect(report).toContain("⚠️ Errors: err: 403 Forbidden");
    expect(report).toContain("alpha");
    expect(report).toContain("beta (disabled)");
    expect(report).toContain("account-3");
  });

  it("formats fallback models list when no groups are present including disabled status", () => {
    const results: AccountQuotaResult[] = [
      {
        index: 0,
        email: "user1@gmail.com",
        status: "ok",
        disabled: true,
        models: [
          {
            label: "Gemini 3.7 Flash",
            modelId: "gemini-3.7-flash",
            remainingPercentage: 100,
            remainingFraction: 1,
            isExhausted: false,
            resetTime: new Date(Date.now() + 3600000),
            resetTimeDisplay: "",
            timeUntilReset: 3600000,
            timeUntilResetFormatted: "1h 0m",
          },
          {
            label: "Claude Sonnet 4.6",
            modelId: "claude-sonnet-4-6",
            remainingPercentage: 50,
            remainingFraction: 0.5,
            isExhausted: false,
            resetTime: new Date(Date.now() + 3600000),
            resetTimeDisplay: "",
            timeUntilReset: 3600000,
            timeUntilResetFormatted: "1h 0m",
          },
        ],
      },
      {
        index: 1,
        email: undefined,
        status: "error",
        error: "Network timeout",
      },
    ];

    const report = formatQuotaReportMarkdown(results);
    expect(report).toContain("# ☁️ Antigravity Quota Status");
    expect(report).toContain("🤖 Gemini Models (Flash / Pro)");
    expect(report).toContain("🧠 Claude Models (Opus / Sonnet)");
    expect(report).toContain("⚠️ Errors: Account 2: Network timeout");
    expect(report).toContain("QUOTA               RESET IN    ACCOUNT");
    expect(report).toContain("user1 (disabled)");
  });
});
