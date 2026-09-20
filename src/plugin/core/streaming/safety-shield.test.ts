import { describe, it, expect, vi } from "vitest";
import { transformSseLine } from "./transformer";
import { createThoughtBuffer } from "./transformer";
import type { SignatureStore, StreamingCallbacks } from "./types";
import { AccountManager } from "../../accounts";
import type { AccountStorageV4 } from "../../storage";

describe("Safety Shield & Telemetry", () => {
  const dummyStore: SignatureStore = {
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    delete: vi.fn(),
  };

  it("extracts safetyRatings from SSE chunks and notifies onSafetyRatings callback", () => {
    const onSafetyRatings = vi.fn();
    const callbacks: StreamingCallbacks = {
      onSafetyRatings,
    };

    const sseLine = 'data: {"response":{"candidates":[{"content":{"parts":[{"text":"analizando exploit"}]},"safetyRatings":[{"category":"HARM_CATEGORY_DANGEROUS_CONTENT","probability":"HIGH"}]}]}}';

    const result = transformSseLine(
      sseLine,
      dummyStore,
      createThoughtBuffer(),
      createThoughtBuffer(),
      callbacks,
      {},
      { injected: false }
    );

    expect(onSafetyRatings).toHaveBeenCalledTimes(1);
    expect(onSafetyRatings).toHaveBeenCalledWith([
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: "HIGH" },
    ]);
    expect(result).toContain("analizando exploit");
  });

  it("increments consecutiveHighRiskTriggers and triggers advanceToNextAccount when threshold met", () => {
    const storage: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "token-1", projectId: "p1", addedAt: 1000, lastUsed: 0 },
        { refreshToken: "token-2", projectId: "p2", addedAt: 1000, lastUsed: 0 },
      ],
      activeIndex: 0,
      activeIndexByFamily: { gemini: 0, claude: 0 },
    };

    const manager = new AccountManager(undefined, storage);
    const acc0 = manager.getCurrentAccountForFamily("gemini")!;
    expect(acc0.index).toBe(0);

    // First high risk trigger
    expect(manager.recordSafetyRiskTrigger(acc0)).toBe(1);
    expect(acc0.consecutiveHighRiskTriggers).toBe(1);

    // Second high risk trigger (threshold = 2)
    expect(manager.recordSafetyRiskTrigger(acc0)).toBe(2);

    // Advance account
    const nextAcc = manager.advanceToNextAccount("gemini");
    expect(nextAcc).not.toBeNull();
    expect(nextAcc!.index).toBe(1);
  });

  it("resets consecutiveHighRiskTriggers when low risk response received", () => {
    const storage: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "token-1", projectId: "p1", addedAt: 1000, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, storage);
    const acc = manager.getCurrentAccountForFamily("gemini")!;
    manager.recordSafetyRiskTrigger(acc);
    expect(acc.consecutiveHighRiskTriggers).toBe(1);

    manager.resetSafetyRiskTrigger(acc);
    expect(acc.consecutiveHighRiskTriggers).toBe(0);
  });
});
