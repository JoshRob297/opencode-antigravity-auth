import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HEADER_TIMEOUT_ATTEMPTS,
  fetchWithHeaderTimeoutRetry,
  isHeaderTimeoutError,
} from "./header-timeout-retry";

function http2Timeout(): Error {
  const error = new Error("http2: timeout awaiting response headers");
  error.name = "Error";
  return error;
}

function okResponse(): Response {
  return new Response("ok", { status: 200 });
}

describe("isHeaderTimeoutError", () => {
  it("recognizes the Node HTTP/2 header timeout", () => {
    expect(isHeaderTimeoutError(http2Timeout())).toBe(true);
  });

  it("recognizes a plain string form", () => {
    expect(isHeaderTimeoutError("TypeError: http2: timeout awaiting response headers")).toBe(true);
  });

  it("does not match unrelated network failures", () => {
    expect(isHeaderTimeoutError(new Error("ECONNRESET"))).toBe(false);
    expect(isHeaderTimeoutError(new Error("fetch failed"))).toBe(false);
    expect(isHeaderTimeoutError(undefined)).toBe(false);
    expect(isHeaderTimeoutError({})).toBe(false);
  });
});

describe("fetchWithHeaderTimeoutRetry", () => {
  it("returns the first successful response without retrying", async () => {
    const doFetch = vi.fn(async () => okResponse());
    const sleep = vi.fn(async () => {});

    const response = await fetchWithHeaderTimeoutRetry(doFetch, { sleep });

    expect(response.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries after the header timeout and returns the second response", async () => {
    const doFetch = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(http2Timeout())
      .mockResolvedValueOnce(okResponse());
    const sleep = vi.fn(async () => {});

    const response = await fetchWithHeaderTimeoutRetry(doFetch, { sleep });

    expect(response.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("backs off further on each attempt", async () => {
    const doFetch = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(http2Timeout())
      .mockRejectedValueOnce(http2Timeout())
      .mockResolvedValueOnce(okResponse());
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});

    await fetchWithHeaderTimeoutRetry(doFetch, { sleep, delayMs: 1_000 });

    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1_000, 2_000]);
  });

  it("does not retry an error that is not a header timeout", async () => {
    const doFetch = vi.fn<() => Promise<Response>>().mockRejectedValue(new Error("ECONNRESET"));
    const sleep = vi.fn(async () => {});

    await expect(fetchWithHeaderTimeoutRetry(doFetch, { sleep })).rejects.toThrow("ECONNRESET");

    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the configured attempts and rethrows the last error", async () => {
    const doFetch = vi.fn<() => Promise<Response>>().mockRejectedValue(http2Timeout());
    const sleep = vi.fn(async () => {});

    await expect(
      fetchWithHeaderTimeoutRetry(doFetch, { sleep, attempts: 2 }),
    ).rejects.toThrow("timeout awaiting response headers");

    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("defaults to three attempts", async () => {
    expect(DEFAULT_HEADER_TIMEOUT_ATTEMPTS).toBe(3);

    const doFetch = vi.fn<() => Promise<Response>>().mockRejectedValue(http2Timeout());
    const sleep = vi.fn(async () => {});

    await expect(fetchWithHeaderTimeoutRetry(doFetch, { sleep })).rejects.toThrow();

    expect(doFetch).toHaveBeenCalledTimes(3);
  });

  it("reports each retry so the caller can log it", async () => {
    const doFetch = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(http2Timeout())
      .mockResolvedValueOnce(okResponse());
    const onRetry = vi.fn();

    await fetchWithHeaderTimeoutRetry(doFetch, { sleep: async () => {}, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
  });
});
