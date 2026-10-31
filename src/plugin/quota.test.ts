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

  it("keeps Gemini 4 Argon out of the Gemini Pro cached quota", async () => {
    const account: AccountMetadataV3 = { ...baseAccount };

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
                  { window: "weekly", remainingFraction: 0.75, resetTime: new Date(Date.now() + 1800000).toISOString() },
                ],
              },
              {
                displayName: "Gemini 4 Argon",
                buckets: [
                  { window: "weekly", remainingFraction: 0.4, resetTime: new Date(Date.now() + 1800000).toISOString() },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchAccountQuotaDetails(account, 0, mockClient);

    expect(result.status).toBe("ok");
    // Argon has its own weekly bucket: it must not drag the Pro value down (or up).
    expect(result.cachedQuota?.argon?.remainingFraction).toBe(0.4);
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
    expect(report).toBe("# Antigravity Quota Status\n\nNo accounts configured.\n");
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
              resetTimeDisplay: "2026-01-01 00:00Z",
              timeUntilReset: 3600000,
              timeUntilResetFormatted: "1h 0m",
            },
            weekly: {
              window: "weekly",
              displayName: "Weekly Limit",
              remainingPercentage: 60,
              remainingFraction: 0.6,
              resetTime: new Date(Date.now() + 86400000 * 3),
              resetTimeDisplay: "2026-01-01 00:00Z",
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
              resetTimeDisplay: "2026-01-01 00:00Z",
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
              resetTimeDisplay: "2026-01-01 00:00Z",
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
    expect(report).toContain("# Antigravity Quota Status");
    expect(report).toContain("Gemini Models (Flash / Pro)");
    expect(report).toContain("Claude & GPT Models (Opus / Sonnet / GPT-OSS)");
    expect(report).toContain("## Other models");
    expect(report).toContain("**Errors:** err: 403 Forbidden");
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
    expect(report).toContain("# Antigravity Quota Status");
    expect(report).toContain("Gemini Models (Flash / Pro)");
    expect(report).toContain("## Claude & GPT Models (Opus / Sonnet / GPT-OSS)");
    expect(report).toContain("**Errors:** Account 2: Network timeout");
    expect(report).toContain("RESET");
    expect(report).toContain("user1 (disabled)");
  });

  it("reports the standalone Argon bucket, short reset timers and per-account capabilities", () => {
    const reset = new Date(Date.now() + 6 * 86400000);
    const bucket = (percentage: number) => ({
      window: "weekly",
      displayName: "Weekly",
      remainingPercentage: percentage,
      remainingFraction: percentage / 100,
      resetTime: reset,
      resetTimeDisplay: "2026-11-07 01:37Z",
      timeUntilReset: reset.getTime() - Date.now(),
      timeUntilResetFormatted: "6d 0h",
    });

    const results: AccountQuotaResult[] = [
      {
        index: 0,
        email: "free@gmail.com",
        status: "ok",
        groups: [{ displayName: "Gemini Models", fiveHour: bucket(90), weekly: bucket(40) }],
        modelCatalog: {
          updatedAt: Date.now(),
          models: {
            "gemini-3.8-flash-high": { remainingFraction: 0.4, resetTime: "2026-10-31T06:40:03Z" },
          },
        },
      },
      {
        index: 1,
        email: "paid@gmail.com",
        status: "ok",
        groups: [
          { displayName: "Gemini Models", fiveHour: bucket(99), weekly: bucket(99) },
          { displayName: "Gemini 4 Argon", weekly: bucket(98) },
        ],
        modelCatalog: {
          updatedAt: Date.now(),
          models: {
            "gemini-4-argon-medium": { remainingFraction: 0.98, resetTime: "2026-11-07T01:37:26Z" },
            "claude-sonnet-5-5-medium": { remainingFraction: 0.99, resetTime: "2026-10-31T06:38:02Z" },
            "gemini-3.8-flash-high": { remainingFraction: 0.99, resetTime: "2026-10-31T06:40:03Z" },
          },
        },
      },
    ];

    const report = formatQuotaReportMarkdown(results);

    // Argon is its own group, not folded into the Gemini Flash/Pro table.
    expect(report).toContain("## Gemini 4 Argon (own weekly bucket)");
    expect(report).toContain("## Gemini Models (Flash / Pro)");
    // Short countdown only: the full date/time was noise.
    expect(report).toContain("6d 0h");
    expect(report).not.toContain("2026-11-07");

    expect(report).toContain("## Account capabilities (measured)");
    const capabilityLines = report.split("\n").filter((line) => line.startsWith("paid") || line.startsWith("free"));
    expect(capabilityLines.some((line) => line.includes("yes 98%"))).toBe(true);
    expect(capabilityLines.some((line) => line.includes("no                          ") || line.split(/\s{2,}/).includes("no"))).toBe(true);
  });

  it("marks capabilities as unmeasured when the account has no catalog", () => {
    const reset = new Date(Date.now() + 3600000);
    const report = formatQuotaReportMarkdown([
      {
        index: 0,
        email: "unknown@gmail.com",
        status: "ok",
        groups: [
          {
            displayName: "Gemini Models",
            fiveHour: {
              window: "5h",
              displayName: "5h",
              remainingPercentage: 100,
              remainingFraction: 1,
              resetTime: reset,
              resetTimeDisplay: "2026-10-31 06:40Z",
              timeUntilReset: 3600000,
              timeUntilResetFormatted: "1h 0m",
            },
          },
        ],
      },
    ]);

    expect(report).toContain("not measured");
  });

  it("marks an account unusable when the weekly window is empty even if the 5h bar is full", () => {
    const now = Date.now();
    const bucket = (percentage: number, resetMs: number) => ({
      window: percentage === 100 ? "weekly" : "5h",
      displayName: "Limit",
      remainingPercentage: percentage,
      remainingFraction: percentage / 100,
      resetTime: new Date(now + resetMs),
      resetTimeDisplay: "2026-10-31 14:46Z",
      timeUntilReset: resetMs,
      timeUntilResetFormatted: formatDuration(resetMs),
    });

    const report = formatQuotaReportMarkdown([
      {
        index: 0,
        email: "spent@gmail.com",
        status: "ok",
        groups: [
          {
            displayName: "Gemini Models",
            fiveHour: bucket(100, 3 * 3600_000),
            weekly: bucket(0, 12 * 3600_000),
          },
        ],
      },
    ]);

    expect(report).toContain("USABLE");
    expect(report).toContain("no · 12h 0m");
    expect(report).not.toMatch(/\[█+░*\] 100%[^\n]*yes/);
  });
});
