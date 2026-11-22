import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@opencode-ai/plugin", () => ({
  tool: vi.fn(),
}));

type WarmupHelpers = {
  MAX_WARMUP_RETRIES: number;
  trackWarmupAttempt: (sessionId: string) => boolean;
  getWarmupAttemptCount: (sessionId: string) => number;
  markWarmupSuccess: (sessionId: string) => void;
  clearWarmupAttempt: (sessionId: string) => void;
};

let helpers: WarmupHelpers;

beforeAll(async () => {
  const { __testExports } = await import("../plugin");
  helpers = __testExports as WarmupHelpers;
});

describe("thinking warmup retry budget", () => {
  it("blocks warmup after MAX_WARMUP_RETRIES attempts in the same session", () => {
    const sessionId = "ses-warmup-limit-1";
    const { MAX_WARMUP_RETRIES, trackWarmupAttempt, getWarmupAttemptCount } = helpers;

    expect(MAX_WARMUP_RETRIES).toBeGreaterThan(1);

    for (let attempt = 1; attempt <= MAX_WARMUP_RETRIES; attempt++) {
      expect(trackWarmupAttempt(sessionId)).toBe(true);
      expect(getWarmupAttemptCount(sessionId)).toBe(attempt);
    }

    // The budget is exhausted: further warmups for this session must be refused.
    expect(trackWarmupAttempt(sessionId)).toBe(false);
    expect(getWarmupAttemptCount(sessionId)).toBe(MAX_WARMUP_RETRIES);
  });

  it("counts attempts independently per session", () => {
    const { MAX_WARMUP_RETRIES, trackWarmupAttempt, getWarmupAttemptCount } = helpers;
    const first = "ses-warmup-limit-2a";
    const second = "ses-warmup-limit-2b";

    expect(trackWarmupAttempt(first)).toBe(true);
    expect(getWarmupAttemptCount(first)).toBe(1);
    expect(getWarmupAttemptCount(second)).toBe(0);

    // Fill the second session's budget, then check it is refused.
    for (let attempt = 1; attempt <= MAX_WARMUP_RETRIES; attempt++) {
      expect(trackWarmupAttempt(second)).toBe(true);
      expect(getWarmupAttemptCount(second)).toBe(attempt);
    }

    expect(getWarmupAttemptCount(second)).toBe(MAX_WARMUP_RETRIES);
    expect(trackWarmupAttempt(second)).toBe(false);
    // Exhausting one session must not consume another session's budget.
    expect(trackWarmupAttempt(first)).toBe(true);
  });

  it("reset on failure gives the session a fresh budget", () => {
    const sessionId = "ses-warmup-limit-3";
    const { MAX_WARMUP_RETRIES, trackWarmupAttempt, getWarmupAttemptCount, clearWarmupAttempt } =
      helpers;

    for (let attempt = 1; attempt <= MAX_WARMUP_RETRIES; attempt++) {
      expect(trackWarmupAttempt(sessionId)).toBe(true);
    }
    expect(trackWarmupAttempt(sessionId)).toBe(false);

    clearWarmupAttempt(sessionId);
    expect(getWarmupAttemptCount(sessionId)).toBe(0);
    expect(trackWarmupAttempt(sessionId)).toBe(true);
  });

  it("a successful warmup stops further attempts for that session", () => {
    const sessionId = "ses-warmup-limit-4";
    const { trackWarmupAttempt, markWarmupSuccess } = helpers;

    expect(trackWarmupAttempt(sessionId)).toBe(true);
    markWarmupSuccess(sessionId);
    expect(trackWarmupAttempt(sessionId)).toBe(false);
  });
});
