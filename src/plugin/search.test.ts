import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  ANTIGRAVITY_ENDPOINT_DAILY,
  SEARCH_THINKING_BUDGET_DEEP,
  SEARCH_THINKING_BUDGET_FAST,
  getAntigravityCliUserAgent,
} from "../constants";
import { executeSearch, executeSearchWithRotation } from "./search";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(
  text: string,
  opts: {
    searchQueries?: string[];
    chunks?: Array<{ title: string; uri: string }>;
    urlMetadata?: Array<{ retrieved_url: string; url_retrieval_status: string }>;
  } = {},
) {
  return {
    response: {
      candidates: [
        {
          content: { role: "model", parts: [{ text }] },
          finishReason: "STOP",
          groundingMetadata: {
            webSearchQueries: opts.searchQueries ?? [],
            groundingChunks: (opts.chunks ?? []).map((c) => ({ web: c })),
          },
          urlContextMetadata: { url_metadata: opts.urlMetadata ?? [] },
        },
      ],
    },
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// ─── executeSearch ────────────────────────────────────────────────────────────

describe("executeSearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch(makeResponse("Default result")));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns formatted text from the response", async () => {
    vi.stubGlobal("fetch", mockFetch(makeResponse("The answer is 42.")));
    const result = await executeSearch({ query: "what is 42?" }, "tok", "proj");
    expect(result).toContain("The answer is 42.");
    expect(result).toContain("## Search Results");
  });

  it("lists sources from groundingChunks (uses groundingMeta internally)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        makeResponse("answer", {
          chunks: [{ title: "Example", uri: "https://example.com/page" }],
        }),
      ),
    );
    const result = await executeSearch({ query: "q" }, "tok", "proj");
    expect(result).toContain("### Sources");
    expect(result).toContain("Example");
    expect(result).toContain("https://example.com/page");
  });

  it("includes search queries section when queries are present", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(makeResponse("res", { searchQueries: ["my query"] })),
    );
    const result = await executeSearch({ query: "my query" }, "tok", "proj");
    expect(result).toContain("### Search Queries Used");
    expect(result).toContain('"my query"');
  });

  it("marks successful URL retrieval with [OK]", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        makeResponse("ok", {
          urlMetadata: [
            { retrieved_url: "https://docs.example.com", url_retrieval_status: "URL_RETRIEVAL_STATUS_SUCCESS" },
          ],
        }),
      ),
    );
    const result = await executeSearch({ query: "q", urls: ["https://docs.example.com"] }, "tok", "proj");
    expect(result).toContain("[OK]");
    expect(result).toContain("https://docs.example.com");
  });

  it("marks failed URL retrieval with [FAIL]", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        makeResponse("ok", {
          urlMetadata: [
            { retrieved_url: "https://broken.example.com", url_retrieval_status: "URL_RETRIEVAL_STATUS_ERROR" },
          ],
        }),
      ),
    );
    const result = await executeSearch({ query: "q", urls: ["https://broken.example.com"] }, "tok", "proj");
    expect(result).toContain("[FAIL]");
  });

  it("returns error block on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "bad" }, 400));
    const result = await executeSearch({ query: "q" }, "tok", "proj");
    expect(result).toContain("## Search Error");
    expect(result).toContain("400");
  });

  it("returns error block when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    const result = await executeSearch({ query: "q" }, "tok", "proj");
    expect(result).toContain("## Search Error");
    expect(result).toContain("Network down");
  });

  it("includes Authorization header with the provided token", async () => {
    const spy = mockFetch(makeResponse("ok"));
    vi.stubGlobal("fetch", spy);
    await executeSearch({ query: "q" }, "bearer-token-xyz", "proj");
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer bearer-token-xyz",
    );
  });

  it("uses ANTIGRAVITY_ENDPOINT_FALLBACKS[0] (not sandbox) and CLI User-Agent (3.4)", async () => {
    const spy = mockFetch(makeResponse("ok"));
    vi.stubGlobal("fetch", spy);
    await executeSearch({ query: "q" }, "tok", "proj");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ANTIGRAVITY_ENDPOINT_FALLBACKS[0]}/v1internal:generateContent`);
    expect(url).not.toContain(ANTIGRAVITY_ENDPOINT_DAILY);
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(getAntigravityCliUserAgent());
  });

  it("applies thinkingConfig budgets based on thinking parameter (3.4)", async () => {
    const spy = mockFetch(makeResponse("ok"));
    vi.stubGlobal("fetch", spy);

    await executeSearch({ query: "deep", thinking: true }, "tok", "proj");
    const deepBody = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(deepBody.request.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: SEARCH_THINKING_BUDGET_DEEP,
    });

    await executeSearch({ query: "fast", thinking: false }, "tok", "proj");
    const fastBody = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string);
    expect(fastBody.request.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: SEARCH_THINKING_BUDGET_FAST,
    });
  });

  it("falls back to secondary endpoints on 5xx/404 responses (3.4)", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () => Promise.resolve("busy"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(makeResponse("from fallback")),
      });
    vi.stubGlobal("fetch", spy);

    const result = await executeSearch({ query: "q" }, "tok", "proj");
    expect(result).toContain("from fallback");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]![0]).toBe(`${ANTIGRAVITY_ENDPOINT_FALLBACKS[0]}/v1internal:generateContent`);
    expect(spy.mock.calls[1]![0]).toBe(`${ANTIGRAVITY_ENDPOINT_FALLBACKS[1]}/v1internal:generateContent`);
  });

  it("rotates accounts when primary account returns 429 (3.4)", async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: () => Promise.resolve("rate limited"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(makeResponse("from second account")),
      });
    vi.stubGlobal("fetch", spy);

    const accounts = [
      { email: "a1@test.com", token: "tok-1", projectId: "proj-1" },
      { email: "a2@test.com", token: "tok-2", projectId: "proj-2" },
    ];

    const result = await executeSearchWithRotation(
      { query: "q" },
      accounts,
      async (acc) => ({ accessToken: acc.token, projectId: acc.projectId }),
    );

    expect(result).toContain("from second account");
    expect(spy).toHaveBeenCalledTimes(2);
    expect((spy.mock.calls[0]![1]!.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-1");
    expect((spy.mock.calls[1]![1]!.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-2");
  });
});
