import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountManager, type ModelFamily, type HeaderStyle, parseRateLimitReason, calculateBackoffMs, type RateLimitReason, resolveQuotaGroup } from "./accounts";
import type { AccountStorageV4 } from "./storage";
import type { OAuthAuthDetails } from "./types";

// Mock storage to prevent test data from leaking to real config files
vi.mock("./storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./storage")>();
  return {
    ...original,
    saveAccounts: vi.fn().mockResolvedValue(undefined),
    saveAccountsReplace: vi.fn().mockResolvedValue(undefined),
  };
});

describe("AccountManager", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("process", { ...process, pid: 0 });
  });

  it("treats on-disk storage as source of truth, even when empty", () => {
    const fallback: OAuthAuthDetails = {
      type: "oauth",
      refresh: "r1|p1",
      access: "access",
      expires: 123,
    };

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [],
      activeIndex: 0,
    };

    const manager = new AccountManager(fallback, stored);
    expect(manager.getAccountCount()).toBe(0);
  });

  it("returns current account when not rate-limited for family", () => {
    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";

    const account = manager.getCurrentOrNextForFamily(family);

    expect(account).not.toBeNull();
    expect(account?.index).toBe(0);
  });

  it("switches to next account when current is rate-limited for family", () => {
    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";

    const firstAccount = manager.getCurrentOrNextForFamily(family);
    manager.markRateLimited(firstAccount!, 60000, family);

    const secondAccount = manager.getCurrentOrNextForFamily(family);
    expect(secondAccount?.index).toBe(1);
  });

  it("returns null when all accounts are rate-limited for family", () => {
    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";

    const accounts = manager.getAccounts();
    accounts.forEach((acc) => manager.markRateLimited(acc, 60000, family));

    const next = manager.getCurrentOrNextForFamily(family);
    expect(next).toBeNull();
  });

  it("picks a Claude account whose 5h remaining is positive despite a weekly cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        {
          refreshToken: "exhausted",
          projectId: "p1",
          addedAt: 1,
          lastUsed: 0,
          email: "empty@example.com",
          rateLimitResetTimes: { claude: Date.now() + 90 * 60 * 1000 },
          cachedQuota: { claude: { remainingFraction: 0 } },
          cachedQuotaUpdatedAt: Date.now(),
        },
        {
          refreshToken: "live",
          projectId: "p2",
          addedAt: 1,
          lastUsed: 0,
          email: "live@example.com",
          rateLimitResetTimes: { claude: Date.now() + 6.5 * 24 * 60 * 60 * 1000 },
          cachedQuota: { claude: { remainingFraction: 1 } },
          cachedQuotaUpdatedAt: Date.now(),
        },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const account = manager.getCurrentOrNextForFamily("claude");
    expect(account?.parts.refreshToken).toBe("live");
    expect(manager.getMinWaitTimeForFamily("claude")).toBe(0);

    vi.useRealTimers();
  });

  it("still honors a short RPM cooldown when remainingFraction is positive", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        {
          refreshToken: "r1",
          projectId: "p1",
          addedAt: 1,
          lastUsed: 0,
          rateLimitResetTimes: { claude: Date.now() + 30_000 },
          cachedQuota: { claude: { remainingFraction: 1 } },
          cachedQuotaUpdatedAt: Date.now(),
        },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    expect(manager.getCurrentOrNextForFamily("claude")).toBeNull();

    vi.useRealTimers();
  });

  it("still skips an exhausted Claude account with a long cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        {
          refreshToken: "r1",
          projectId: "p1",
          addedAt: 1,
          lastUsed: 0,
          rateLimitResetTimes: { claude: Date.now() + 5 * 60 * 60 * 1000 },
          cachedQuota: { claude: { remainingFraction: 0 } },
          cachedQuotaUpdatedAt: Date.now(),
        },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    expect(manager.getCurrentOrNextForFamily("claude")).toBeNull();

    vi.useRealTimers();
  });

  it("un-rate-limits accounts after timeout expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";
    const account = manager.getCurrentOrNextForFamily(family);

    account!.rateLimitResetTimes[family] = Date.now() - 10000;

    const next = manager.getCurrentOrNextForFamily(family);
    expect(next?.parts.refreshToken).toBe("r1");
  });

  it("returns minimum wait time for family", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";
    const accounts = manager.getAccounts();

    manager.markRateLimited(accounts[0]!, 30000, family);
    manager.markRateLimited(accounts[1]!, 60000, family);

    expect(manager.getMinWaitTimeForFamily(family)).toBe(30000);
  });

  it("tracks rate limits per model family independently", () => {
    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);

    const account = manager.getCurrentOrNextForFamily("claude");
    expect(account?.index).toBe(0);

    manager.markRateLimited(account!, 60000, "claude");

    expect(manager.getMinWaitTimeForFamily("claude")).toBeGreaterThan(0);
    expect(manager.getMinWaitTimeForFamily("gemini")).toBe(0);

    const geminiOnAccount0 = manager.getNextForFamily("gemini");
    expect(geminiOnAccount0?.index).toBe(0);

    const claudeBlocked = manager.getNextForFamily("claude");
    expect(claudeBlocked).toBeNull();
  });

  it("getCurrentOrNextForFamily sticks to same account until rate-limited", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";

    const first = manager.getCurrentOrNextForFamily(family);
    expect(first?.parts.refreshToken).toBe("r1");

    const second = manager.getCurrentOrNextForFamily(family);
    expect(second?.parts.refreshToken).toBe("r1");

    const third = manager.getCurrentOrNextForFamily(family);
    expect(third?.parts.refreshToken).toBe("r1");

    manager.markRateLimited(first!, 60_000, family);

    const fourth = manager.getCurrentOrNextForFamily(family);
    expect(fourth?.parts.refreshToken).toBe("r2");

    const fifth = manager.getCurrentOrNextForFamily(family);
    expect(fifth?.parts.refreshToken).toBe("r2");
  });

  it("removes an account and keeps cursor consistent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 1,
    };

    const manager = new AccountManager(undefined, stored);
    const family: ModelFamily = "claude";

    const picked = manager.getCurrentOrNextForFamily(family);
    expect(picked?.parts.refreshToken).toBe("r2");

    manager.removeAccount(picked!);
    expect(manager.getAccountCount()).toBe(2);

    const next = manager.getNextForFamily(family);
    expect(next?.parts.refreshToken).toBe("r3");
  });

  it("attaches fallback access tokens only to the matching stored account", () => {
    const fallback: OAuthAuthDetails = {
      type: "oauth",
      refresh: "r2|p2",
      access: "access-2",
      expires: 123,
    };

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(fallback, stored);
    const snapshot = manager.getAccountsSnapshot();

    expect(snapshot[0]?.access).toBeUndefined();
    expect(snapshot[0]?.expires).toBeUndefined();
    expect(snapshot[1]?.access).toBe("access-2");
    expect(snapshot[1]?.expires).toBe(123);
  });

  it("debounces toast display for same account", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const stored: AccountStorageV4 = {
      version: 4,
      accounts: [
        { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
      ],
      activeIndex: 0,
    };

    const manager = new AccountManager(undefined, stored);

    expect(manager.shouldShowAccountToast(0)).toBe(true);
    manager.markToastShown(0);

    expect(manager.shouldShowAccountToast(0)).toBe(false);

    expect(manager.shouldShowAccountToast(1)).toBe(true);

    vi.setSystemTime(new Date(31000));
    expect(manager.shouldShowAccountToast(0)).toBe(true);
  });

  describe("header style fallback for Gemini", () => {
    it("tracks rate limits for antigravity header style", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 60000, "gemini", "antigravity");

      expect(manager.isRateLimitedForHeaderStyle(account!, "gemini", "antigravity")).toBe(true);
    });

    it("getAvailableHeaderStyle returns antigravity first for Gemini", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      expect(manager.getAvailableHeaderStyle(account!, "gemini")).toBe("antigravity");
    });

    it("getAvailableHeaderStyle returns null when antigravity is rate-limited", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 60000, "gemini", "antigravity");

      expect(manager.getAvailableHeaderStyle(account!, "gemini")).toBeNull();
    });

    it("getAvailableHeaderStyle returns null when both header styles are rate-limited", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 60000, "gemini", "antigravity");
      manager.markRateLimited(account!, 60000, "gemini", "antigravity");

      expect(manager.getAvailableHeaderStyle(account!, "gemini")).toBeNull();
    });

    it("getAvailableHeaderStyle always returns antigravity for Claude", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      expect(manager.getAvailableHeaderStyle(account!, "claude")).toBe("antigravity");
    });

    it("getAvailableHeaderStyle returns null for Claude when rate-limited", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      manager.markRateLimited(account!, 60000, "claude", "antigravity");

      expect(manager.getAvailableHeaderStyle(account!, "claude")).toBeNull();
    });

    it("Gemini rate limits expire correctly", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 30000, "gemini", "antigravity");

      expect(manager.isRateLimitedForHeaderStyle(account!, "gemini", "antigravity")).toBe(true);

      vi.setSystemTime(new Date(35000));

      expect(manager.isRateLimitedForHeaderStyle(account!, "gemini", "antigravity")).toBe(false);
      expect(manager.getAvailableHeaderStyle(account!, "gemini")).toBe("antigravity");
    });

    it("getMinWaitTimeForFamily returns correct wait time for Gemini", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 30000, "gemini", "antigravity");

      expect(manager.getMinWaitTimeForFamily("gemini")).toBe(30000);
    });
  });

  describe("per-family account tracking", () => {
    it("tracks current account independently per model family", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);

      const claudeAccount = manager.getCurrentOrNextForFamily("claude");
      expect(claudeAccount?.parts.refreshToken).toBe("r1");

      manager.markRateLimited(claudeAccount!, 60000, "claude");

      const nextClaude = manager.getCurrentOrNextForFamily("claude");
      expect(nextClaude?.parts.refreshToken).toBe("r2");

      const geminiAccount = manager.getCurrentOrNextForFamily("gemini");
      expect(geminiAccount?.parts.refreshToken).toBe("r1");
    });

    it("switching Claude account does not affect Gemini account selection", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);

      expect(manager.getCurrentOrNextForFamily("gemini")?.parts.refreshToken).toBe("r1");

      const claude1 = manager.getCurrentOrNextForFamily("claude");
      manager.markRateLimited(claude1!, 60000, "claude");

      expect(manager.getCurrentOrNextForFamily("claude")?.parts.refreshToken).toBe("r2");
      expect(manager.getCurrentOrNextForFamily("gemini")?.parts.refreshToken).toBe("r1");

      const claude2 = manager.getCurrentOrNextForFamily("claude");
      manager.markRateLimited(claude2!, 60000, "claude");

      expect(manager.getCurrentOrNextForFamily("claude")?.parts.refreshToken).toBe("r3");
      expect(manager.getCurrentOrNextForFamily("gemini")?.parts.refreshToken).toBe("r1");
    });

    it("persists per-family indices to storage", async () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);

      const claude = manager.getCurrentOrNextForFamily("claude");
      manager.markRateLimited(claude!, 60000, "claude");
      manager.getCurrentOrNextForFamily("claude");

      expect(manager.getCurrentAccountForFamily("claude")?.index).toBe(1);
      expect(manager.getCurrentAccountForFamily("gemini")?.index).toBe(0);
    });

    it("loads per-family indices from storage", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
        activeIndexByFamily: {
          claude: 2,
          gemini: 1,
        },
      };

      const manager = new AccountManager(undefined, stored);

      expect(manager.getCurrentAccountForFamily("claude")?.parts.refreshToken).toBe("r3");
      expect(manager.getCurrentAccountForFamily("gemini")?.parts.refreshToken).toBe("r2");
    });

    it("falls back to activeIndex when activeIndexByFamily is not present", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 1,
      };

      const manager = new AccountManager(undefined, stored);

      expect(manager.getCurrentAccountForFamily("claude")?.parts.refreshToken).toBe("r2");
      expect(manager.getCurrentAccountForFamily("gemini")?.parts.refreshToken).toBe("r2");
    });
  });

  describe("account cooldown (non-429 errors)", () => {
    it("marks account as cooling down with reason", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      manager.markAccountCoolingDown(account!, 30000, "auth-failure");

      expect(manager.isAccountCoolingDown(account!)).toBe(true);
    });

    it("cooldown expires after duration", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      manager.markAccountCoolingDown(account!, 30000, "network-error");

      expect(manager.isAccountCoolingDown(account!)).toBe(true);

      vi.setSystemTime(new Date(35000));

      expect(manager.isAccountCoolingDown(account!)).toBe(false);
    });

    it("clearAccountCooldown removes cooldown state", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      manager.markAccountCoolingDown(account!, 30000, "auth-failure");
      expect(manager.isAccountCoolingDown(account!)).toBe(true);

      manager.clearAccountCooldown(account!);
      expect(manager.isAccountCoolingDown(account!)).toBe(false);
    });

    it("cooling down account is skipped in getCurrentOrNextForFamily", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account1 = manager.getCurrentOrNextForFamily("claude");

      manager.markAccountCoolingDown(account1!, 30000, "project-error");

      const next = manager.getCurrentOrNextForFamily("claude");
      expect(next?.parts.refreshToken).toBe("r2");
    });

    it("cooldown is independent from rate limits", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markAccountCoolingDown(account!, 30000, "auth-failure");

      expect(manager.isAccountCoolingDown(account!)).toBe(true);
      expect(manager.isRateLimitedForHeaderStyle(account!, "gemini", "antigravity")).toBe(false);
      expect(manager.isRateLimitedForHeaderStyle(account!, "gemini", "antigravity")).toBe(false);
    });
  });

  describe("account selection strategies", () => {
    describe("sticky strategy (default)", () => {
      it("returns same account on consecutive calls", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const first = manager.getCurrentOrNextForFamily("claude", null, "sticky");
        const second = manager.getCurrentOrNextForFamily("claude", null, "sticky");
        const third = manager.getCurrentOrNextForFamily("claude", null, "sticky");

        expect(first?.index).toBe(0);
        expect(second?.index).toBe(0);
        expect(third?.index).toBe(0);
      });

      it("switches account only when current is rate-limited", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const first = manager.getCurrentOrNextForFamily("claude", null, "sticky");
        expect(first?.index).toBe(0);

        manager.markRateLimited(first!, 60000, "claude");

        const second = manager.getCurrentOrNextForFamily("claude", null, "sticky");
        expect(second?.index).toBe(1);
      });
    });

    describe("round-robin strategy", () => {
      it("rotates to next account on each call", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const first = manager.getCurrentOrNextForFamily("claude", null, "round-robin");
        const second = manager.getCurrentOrNextForFamily("claude", null, "round-robin");
        const third = manager.getCurrentOrNextForFamily("claude", null, "round-robin");
        const fourth = manager.getCurrentOrNextForFamily("claude", null, "round-robin");

        const indices = [first?.index, second?.index, third?.index, fourth?.index];
        expect(new Set(indices).size).toBeGreaterThanOrEqual(2);
      });

      it("skips rate-limited accounts", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const accounts = manager.getAccounts();
        manager.markRateLimited(accounts[1]!, 60000, "claude");

        const first = manager.getCurrentOrNextForFamily("claude", null, "round-robin");
        const second = manager.getCurrentOrNextForFamily("claude", null, "round-robin");

        expect(first?.index).not.toBe(1);
        expect(second?.index).not.toBe(1);
      });
    });

    describe("hybrid strategy", () => {
      it("returns fresh (untouched) accounts first", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const first = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        const second = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        const third = manager.getCurrentOrNextForFamily("claude", null, "hybrid");

        const indices = [first?.index, second?.index, third?.index];
        expect(indices).toContain(0);
        expect(indices).toContain(1);
        expect(indices).toContain(2);
      });

      it("continues to return valid accounts after all touched", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        manager.getCurrentOrNextForFamily("claude", null, "hybrid");

        const third = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        const fourth = manager.getCurrentOrNextForFamily("claude", null, "hybrid");

        expect(third).not.toBeNull();
        expect(fourth).not.toBeNull();
        expect([0, 1]).toContain(third?.index);
        expect([0, 1]).toContain(fourth?.index);
      });
    });

    describe("hybrid strategy with token bucket", () => {
      it("returns account based on health and token availability", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r3", projectId: "p3", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const first = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        expect(first).not.toBeNull();
        expect([0, 1, 2]).toContain(first?.index);
      });

      it("skips rate-limited accounts", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const accounts = manager.getAccounts();
        manager.markRateLimited(accounts[0]!, 60000, "claude");

        const selected = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        expect(selected?.index).toBe(1);
      });

      it("skips cooling down accounts", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const accounts = manager.getAccounts();
        manager.markAccountCoolingDown(accounts[0]!, 60000, "auth-failure");

        const selected = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        expect(selected?.index).toBe(1);
      });

      it("falls back to sticky when all accounts unavailable", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);

        const selected = manager.getCurrentOrNextForFamily("claude", null, "hybrid");
        expect(selected?.index).toBe(0);
      });

      it("updates lastUsed and currentAccountIndexByFamily on selection", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(5000));

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
            { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const selected = manager.getCurrentOrNextForFamily("claude", null, "hybrid");

        expect(selected).not.toBeNull();
        expect(selected!.lastUsed).toBe(5000);
        expect(manager.getCurrentAccountForFamily("claude")?.index).toBe(selected?.index);
      });
    });
  });

  describe("touchedForQuota tracking", () => {
    it("marks account as touched with timestamp", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1000));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      manager.markTouchedForQuota(account, "claude:antigravity");

      expect(account.touchedForQuota["claude:antigravity"]).toBe(1000);
    });

    it("isFreshForQuota returns true for untouched accounts", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      expect(manager.isFreshForQuota(account, "claude:antigravity")).toBe(true);
    });

    it("isFreshForQuota returns false for recently touched accounts", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1000));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      manager.markTouchedForQuota(account, "claude:antigravity");

      expect(manager.isFreshForQuota(account, "claude:antigravity")).toBe(false);
    });

    it("isFreshForQuota returns true after quota reset time passes", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1000));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      manager.markTouchedForQuota(account, "claude");
      expect(manager.isFreshForQuota(account, "claude")).toBe(false);
      
      manager.markRateLimited(account, 60000, "claude", "antigravity");
      
      vi.setSystemTime(new Date(70000));
      expect(manager.isFreshForQuota(account, "claude")).toBe(true);
    });
  });

  describe("consecutiveFailures tracking", () => {
    it("initializes consecutiveFailures as undefined", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      expect(account.consecutiveFailures).toBeUndefined();
    });

    it("can increment and reset consecutiveFailures", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      account.consecutiveFailures = (account.consecutiveFailures ?? 0) + 1;
      expect(account.consecutiveFailures).toBe(1);

      account.consecutiveFailures = (account.consecutiveFailures ?? 0) + 1;
      expect(account.consecutiveFailures).toBe(2);

      account.consecutiveFailures = 0;
      expect(account.consecutiveFailures).toBe(0);
    });
  });

  describe("Issue #147: headerStyle-aware account selection", () => {
    it("skips account when rate-limited and gets next available account", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
        activeIndexByFamily: { claude: 0, gemini: 0 },
      };

      const manager = new AccountManager(undefined, stored);
      const firstAccount = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(firstAccount!, 60000, "gemini", "antigravity");

      expect(manager.isRateLimitedForHeaderStyle(firstAccount!, "gemini", "antigravity")).toBe(true);

      const nextAccount = manager.getCurrentOrNextForFamily(
        "gemini", 
        null, 
        "sticky", 
        "antigravity"
      );

      expect(nextAccount?.index).toBe(1);
    });
  });

  describe("Issue #174: saveToDisk throttling", () => {
    it("requestSaveToDisk coalesces multiple calls into one write", async () => {
      vi.useFakeTimers();

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const saveSpy = vi.spyOn(manager, "saveToDisk").mockResolvedValue();

      manager.requestSaveToDisk();
      manager.requestSaveToDisk();
      manager.requestSaveToDisk();

      expect(saveSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1500);

      expect(saveSpy).toHaveBeenCalledTimes(1);

      saveSpy.mockRestore();
    });

    it("flushSaveToDisk waits for pending save to complete", async () => {
      vi.useFakeTimers();

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const saveSpy = vi.spyOn(manager, "saveToDisk").mockResolvedValue();

      manager.requestSaveToDisk();

      const flushPromise = manager.flushSaveToDisk();

      await vi.advanceTimersByTimeAsync(1500);
      await flushPromise;

      expect(saveSpy).toHaveBeenCalledTimes(1);

      saveSpy.mockRestore();
    });

    it("does not save again if no new requestSaveToDisk after flush", async () => {
      vi.useFakeTimers();

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const saveSpy = vi.spyOn(manager, "saveToDisk").mockResolvedValue();

      manager.requestSaveToDisk();
      await vi.advanceTimersByTimeAsync(1500);

      expect(saveSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);

      expect(saveSpy).toHaveBeenCalledTimes(1);

      saveSpy.mockRestore();
    });
  });

  describe("Rate Limit Reason Classification", () => {
    it("getMinWaitTimeForFamily respects strict header style", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("gemini");

      manager.markRateLimited(account!, 30000, "gemini", "antigravity", "gemini-3-pro-image");

      expect(
        manager.getMinWaitTimeForFamily(
          "gemini",
          "gemini-3-pro-image",
          "antigravity",
          true,
        ),
      ).toBe(30000);

      expect(manager.getMinWaitTimeForFamily("gemini", "gemini-3-pro-image")).toBe(30000);
    });

    describe("parseRateLimitReason", () => {
      it("parses QUOTA_EXHAUSTED from reason field", () => {
        expect(parseRateLimitReason("QUOTA_EXHAUSTED", undefined)).toBe("QUOTA_EXHAUSTED");
        expect(parseRateLimitReason("quota_exhausted", undefined)).toBe("QUOTA_EXHAUSTED");
      });

      it("parses RATE_LIMIT_EXCEEDED from reason field", () => {
        expect(parseRateLimitReason("RATE_LIMIT_EXCEEDED", undefined)).toBe("RATE_LIMIT_EXCEEDED");
      });

      it("parses MODEL_CAPACITY_EXHAUSTED from reason field", () => {
        expect(parseRateLimitReason("MODEL_CAPACITY_EXHAUSTED", undefined)).toBe("MODEL_CAPACITY_EXHAUSTED");
      });

      it("falls back to message parsing when reason is absent", () => {
        expect(parseRateLimitReason(undefined, "Rate limit exceeded per minute")).toBe("RATE_LIMIT_EXCEEDED");
        expect(parseRateLimitReason(undefined, "Too many requests")).toBe("RATE_LIMIT_EXCEEDED");
        expect(parseRateLimitReason(undefined, "Quota exhausted for today")).toBe("QUOTA_EXHAUSTED");
      });

      it("returns UNKNOWN when no pattern matches", () => {
        expect(parseRateLimitReason(undefined, "Some other error")).toBe("UNKNOWN");
        expect(parseRateLimitReason(undefined, undefined)).toBe("UNKNOWN");
      });
    });

    describe("calculateBackoffMs", () => {
      it("uses retryAfterMs when provided", () => {
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0, 120_000)).toBe(120_000);
        expect(calculateBackoffMs("RATE_LIMIT_EXCEEDED", 0, 45_000)).toBe(45_000);
      });

      it("enforces minimum 2s backoff", () => {
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0, 500)).toBe(2_000);
        expect(calculateBackoffMs("RATE_LIMIT_EXCEEDED", 0, 1_000)).toBe(2_000);
      });

      it("applies exponential backoff for QUOTA_EXHAUSTED", () => {
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0)).toBe(60_000);
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 1)).toBe(300_000);
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 2)).toBe(1_800_000);
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 3)).toBe(7_200_000);
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 10)).toBe(7_200_000);
      });

      it("returns fixed backoff for RATE_LIMIT_EXCEEDED", () => {
        expect(calculateBackoffMs("RATE_LIMIT_EXCEEDED", 0)).toBe(30_000);
        expect(calculateBackoffMs("RATE_LIMIT_EXCEEDED", 5)).toBe(30_000);
      });

      it("returns short backoff for MODEL_CAPACITY_EXHAUSTED", () => {
        // Base backoff is 45s with ±15s jitter (range: 30s to 60s)
        const result = calculateBackoffMs("MODEL_CAPACITY_EXHAUSTED", 0);
        expect(result).toBeGreaterThanOrEqual(30_000);
        expect(result).toBeLessThanOrEqual(60_000);
      });

      it("returns soft retry for SERVER_ERROR", () => {
        expect(calculateBackoffMs("SERVER_ERROR", 0)).toBe(20_000);
      });

      it("returns default backoff for UNKNOWN", () => {
        expect(calculateBackoffMs("UNKNOWN", 0)).toBe(60_000);
      });

      it("caps RPM Retry-After when the server sends a weekly reset", () => {
        const weekMs = 6.5 * 24 * 60 * 60 * 1000;
        expect(calculateBackoffMs("RATE_LIMIT_EXCEEDED", 0, weekMs)).toBe(60_000);
        expect(calculateBackoffMs("UNKNOWN", 0, weekMs)).toBe(60_000);
      });

      it("keeps quota Retry-After when remaining is exhausted", () => {
        const fiveHoursMs = 5 * 60 * 60 * 1000;
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0, fiveHoursMs)).toBe(fiveHoursMs);
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0, fiveHoursMs, 0)).toBe(fiveHoursMs);
      });

      it("caps quota Retry-After when remainingFraction is still positive", () => {
        const weekMs = 6.5 * 24 * 60 * 60 * 1000;
        expect(calculateBackoffMs("QUOTA_EXHAUSTED", 0, weekMs, 1)).toBe(60_000);
      });
    });

    describe("markRateLimitedWithReason", () => {
      it("tracks consecutive failures and applies escalating backoff", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const account = manager.getAccounts()[0]!;

        const backoff1 = manager.markRateLimitedWithReason(
          account, "gemini", "antigravity", null, "QUOTA_EXHAUSTED"
        );
        expect(backoff1).toBe(60_000);
        expect(account.consecutiveFailures).toBe(1);

        const backoff2 = manager.markRateLimitedWithReason(
          account, "gemini", "antigravity", null, "QUOTA_EXHAUSTED"
        );
        expect(backoff2).toBe(300_000);
        expect(account.consecutiveFailures).toBe(2);

        const backoff3 = manager.markRateLimitedWithReason(
          account, "gemini", "antigravity", null, "QUOTA_EXHAUSTED"
        );
        expect(backoff3).toBe(1_800_000);
        expect(account.consecutiveFailures).toBe(3);

        vi.useRealTimers();
      });

      it("uses provided retryAfterMs over calculated backoff", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const account = manager.getAccounts()[0]!;

        const backoff = manager.markRateLimitedWithReason(
          account, "gemini", "antigravity", null, "QUOTA_EXHAUSTED", 180_000
        );
        expect(backoff).toBe(180_000);

        vi.useRealTimers();
      });

      it("does not persist a weekly Claude cooldown when cached remaining is positive", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            {
              refreshToken: "r1",
              projectId: "p1",
              addedAt: 1,
              lastUsed: 0,
              cachedQuota: { claude: { remainingFraction: 1 } },
              cachedQuotaUpdatedAt: 1_000,
            },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const account = manager.getAccounts()[0]!;
        const weekMs = 6.5 * 24 * 60 * 60 * 1000;
        const backoff = manager.markRateLimitedWithReason(
          account, "claude", "antigravity", "claude-sonnet-4-6", "QUOTA_EXHAUSTED", weekMs
        );

        expect(backoff).toBe(60_000);
        expect(account.rateLimitResetTimes.claude).toBe(1_000 + 60_000);

        vi.useRealTimers();
      });

      it("caps weekly absoluteResetAtMs when cached remaining is positive", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            {
              refreshToken: "r1",
              projectId: "p1",
              addedAt: 1,
              lastUsed: 0,
              cachedQuota: { claude: { remainingFraction: 1 } },
              cachedQuotaUpdatedAt: 1_000,
            },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const account = manager.getAccounts()[0]!;
        const weekMs = 6.5 * 24 * 60 * 60 * 1000;
        const backoff = manager.markRateLimitedWithReason(
          account,
          "claude",
          "antigravity",
          "claude-sonnet-4-6",
          "QUOTA_EXHAUSTED",
          weekMs,
          3600_000,
          1_000 + weekMs,
        );

        expect(backoff).toBe(60_000);
        expect(account.rateLimitResetTimes.claude).toBe(1_000 + 60_000);

        vi.useRealTimers();
      });
    });

    describe("markRequestSuccess", () => {
      it("resets consecutive failure counter", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const account = manager.getAccounts()[0]!;

        account.consecutiveFailures = 5;
        manager.markRequestSuccess(account);
        expect(account.consecutiveFailures).toBe(0);
      });
    });

    describe("Optimistic Reset", () => {
      it("shouldTryOptimisticReset returns true when min wait time <= 2s", () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0, rateLimitResetTimes: { "gemini-antigravity": 11_500, "antigravity": 11_500 } },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        expect(manager.shouldTryOptimisticReset("gemini")).toBe(true);

        vi.useRealTimers();
      });

      it("shouldTryOptimisticReset returns false when min wait time > 2s", () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0, rateLimitResetTimes: { "gemini-antigravity": 15_000, "antigravity": 15_000 } },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        expect(manager.shouldTryOptimisticReset("gemini")).toBe(false);

        vi.useRealTimers();
      });

      it("shouldTryOptimisticReset returns false when accounts are available", () => {
        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        expect(manager.shouldTryOptimisticReset("gemini")).toBe(false);
      });

      it("clearAllRateLimitsForFamily clears rate limits and failure counters", () => {
        vi.useFakeTimers();
        vi.setSystemTime(10_000);

        const stored: AccountStorageV4 = {
          version: 4,
          accounts: [
            { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0, rateLimitResetTimes: { "gemini-antigravity": 70_000, "antigravity": 80_000 } },
            { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0, rateLimitResetTimes: { "gemini-antigravity": 90_000 } },
          ],
          activeIndex: 0,
        };

        const manager = new AccountManager(undefined, stored);
        const accounts = manager.getAccounts();
        accounts[0]!.consecutiveFailures = 3;
        accounts[1]!.consecutiveFailures = 2;

        manager.clearAllRateLimitsForFamily("gemini");

        expect(accounts[0]!.rateLimitResetTimes["gemini-antigravity"]).toBeUndefined();
        expect(accounts[1]!.rateLimitResetTimes["gemini-antigravity"]).toBeUndefined();
        expect(accounts[0]!.consecutiveFailures).toBe(0);
        expect(accounts[1]!.consecutiveFailures).toBe(0);

        vi.useRealTimers();
      });
    });
  });

  describe("Failure TTL Expiration", () => {
    it("resets consecutiveFailures when lastFailureTime exceeds TTL", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      // First failure
      manager.markRateLimitedWithReason(account!, "claude", "antigravity", null, "QUOTA_EXHAUSTED", null, 3600_000);
      expect(account!.consecutiveFailures).toBe(1);
      expect(account!.lastFailureTime).toBe(0);

      // Advance time past TTL (1 hour = 3600s)
      vi.setSystemTime(new Date(3700_000)); // 3700 seconds later

      // Next failure should reset count because TTL expired
      manager.markRateLimitedWithReason(account!, "claude", "antigravity", null, "QUOTA_EXHAUSTED", null, 3600_000);
      expect(account!.consecutiveFailures).toBe(1); // Reset to 0, then +1

      vi.useRealTimers();
    });

    it("keeps consecutiveFailures when within TTL", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");

      // First failure
      manager.markRateLimitedWithReason(account!, "claude", "antigravity", null, "QUOTA_EXHAUSTED", null, 3600_000);
      expect(account!.consecutiveFailures).toBe(1);

      // Advance time within TTL
      vi.setSystemTime(new Date(1800_000)); // 30 minutes later (within 1 hour TTL)

      // Next failure should increment
      manager.markRateLimitedWithReason(account!, "claude", "antigravity", null, "QUOTA_EXHAUSTED", null, 3600_000);
      expect(account!.consecutiveFailures).toBe(2);

      vi.useRealTimers();
    });
  });

  describe("Fingerprint History", () => {
    it("regenerateAccountFingerprint saves old fingerprint to history", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getCurrentOrNextForFamily("claude");
      
      // Set initial fingerprint
      const originalFingerprint = account!.fingerprint;
      
      // Regenerate
      const newFingerprint = manager.regenerateAccountFingerprint(0);
      
      expect(newFingerprint).not.toBeNull();
      expect(newFingerprint).not.toEqual(originalFingerprint);
      expect(account!.fingerprintHistory?.length).toBeGreaterThanOrEqual(0);
    });

    it("restoreAccountFingerprint restores from history", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1000)); // Start at 1000 to avoid 0 being falsy

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.getCurrentOrNextForFamily("claude");
      
      // Generate initial fingerprint
      const original = manager.regenerateAccountFingerprint(0);
      const originalDeviceId = original?.deviceId;
      
      vi.setSystemTime(new Date(2000));
      
      // Generate second fingerprint (pushes first to history at index 0)
      manager.regenerateAccountFingerprint(0);
      
      // History[0] should be the "original" fingerprint
      const history = manager.getAccountFingerprintHistory(0);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]?.fingerprint.deviceId).toBe(originalDeviceId);
      
      vi.setSystemTime(new Date(3000));
      
      // Restore from history[0] - should get the "original" back
      // Note: restore also pushes current to history, so after restore:
      // - Current = original fingerprint
      // - History[0] = what was current before restore
      const restored = manager.restoreAccountFingerprint(0, 0);
      
      expect(restored).not.toBeNull();
      expect(restored?.deviceId).toBe(originalDeviceId);

      vi.useRealTimers();
    });

    it("getAccountFingerprintHistory returns empty array for new account", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      
      const history = manager.getAccountFingerprintHistory(0);
      expect(history).toEqual([]);
    });

    it("limits fingerprint history to MAX_FINGERPRINT_HISTORY", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      
      // Regenerate 7 times (should only keep 5 in history)
      for (let i = 0; i < 7; i++) {
        manager.regenerateAccountFingerprint(0);
      }
      
      const history = manager.getAccountFingerprintHistory(0);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe("soft quota threshold", () => {
    it("skips account over soft quota threshold in sticky mode", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.05, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r2");
    });

    it("allows account under soft quota threshold", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.15, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r1");
    });

    it("threshold of 100 disables soft quota protection", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.01, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 100);
      expect(account?.parts.refreshToken).toBe("r1");
    });

    it("returns null when all accounts over threshold", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.05, modelCount: 1 } });
      manager.updateQuotaCache(1, { claude: { remainingFraction: 0.08, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account).toBeNull();
    });

    it("skips account over threshold in round-robin mode", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.05, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "round-robin", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r2");
    });

    it("account without cached quota is not skipped", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r1");
    });

    it("handles remainingFraction of 0 (fully exhausted)", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0, modelCount: 1 } });

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r2");
    });

    it("ignores stale quota cache (over 10 minutes old)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.05, modelCount: 1 } });

      vi.setSystemTime(new Date(11 * 60 * 1000));

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r1");

      vi.useRealTimers();
    });

    it("fails open when cachedQuotaUpdatedAt is missing", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const acc = (manager as any).accounts[0];
      acc.cachedQuota = { claude: { remainingFraction: 0.05, modelCount: 1 } };
      acc.cachedQuotaUpdatedAt = undefined;

      const account = manager.getCurrentOrNextForFamily("claude", null, "sticky", "antigravity", false, 90);
      expect(account?.parts.refreshToken).toBe("r1");
    });
  });

  describe("getMinWaitTimeForSoftQuota", () => {
    it("returns 0 when accounts are available (under threshold)", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.15, modelCount: 1 } });

      const waitMs = manager.getMinWaitTimeForSoftQuota("claude", 90, 10 * 60 * 1000);
      expect(waitMs).toBe(0);
    });

    it("returns null when no resetTime available", () => {
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { claude: { remainingFraction: 0.05, modelCount: 1 } });

      const waitMs = manager.getMinWaitTimeForSoftQuota("claude", 90, 10 * 60 * 1000);
      expect(waitMs).toBeNull();
    });

    it("returns wait time from resetTime when over threshold", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-28T10:00:00Z"));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { 
        claude: { 
          remainingFraction: 0.05, 
          resetTime: "2026-01-28T15:00:00Z",
          modelCount: 1 
        } 
      });

      const waitMs = manager.getMinWaitTimeForSoftQuota("claude", 90, 10 * 60 * 1000);
      expect(waitMs).toBe(5 * 60 * 60 * 1000);

      vi.useRealTimers();
    });

    it("returns null (fail-open) when resetTime is in the past", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-28T16:00:00Z"));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { 
        claude: { 
          remainingFraction: 0.05, 
          resetTime: "2026-01-28T15:00:00Z",
          modelCount: 1 
        } 
      });

      const waitMs = manager.getMinWaitTimeForSoftQuota("claude", 90, 10 * 60 * 1000);
      expect(waitMs).toBe(null);

      vi.useRealTimers();
    });

    it("returns minimum wait time across multiple accounts", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-28T10:00:00Z"));

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
          { refreshToken: "r2", projectId: "p2", addedAt: 2, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      manager.updateQuotaCache(0, { 
        claude: { remainingFraction: 0.05, resetTime: "2026-01-28T15:00:00Z", modelCount: 1 } 
      });
      manager.updateQuotaCache(1, { 
        claude: { remainingFraction: 0.08, resetTime: "2026-01-28T12:00:00Z", modelCount: 1 } 
      });

      const waitMs = manager.getMinWaitTimeForSoftQuota("claude", 90, 10 * 60 * 1000);
      expect(waitMs).toBe(2 * 60 * 60 * 1000);

      vi.useRealTimers();
    });
  });
  describe("absoluteResetAtMs support in markRateLimitedWithReason", () => {
    it("uses exact future timestamp when provided", () => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0 },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const account = manager.getAccounts()[0]!;

      const absoluteFutureMs = 100_000 + 7_200_000; // 2 hours in future
      const wait = manager.markRateLimitedWithReason(
        account,
        "gemini",
        "antigravity",
        null,
        "QUOTA_EXHAUSTED",
        null,
        3600_000,
        absoluteFutureMs,
      );

      expect(wait).toBe(7_200_000);
      expect(account.rateLimitResetTimes["gemini-antigravity"]).toBe(absoluteFutureMs);

      vi.useRealTimers();
    });
  });

  describe("getMinWaitTimeForFamily with cooldowns", () => {
    it("accounts for coolingDownUntil when calculating wait time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { refreshToken: "r1", projectId: "p1", addedAt: 1, lastUsed: 0, coolingDownUntil: 40_000, cooldownReason: "auth-failure" },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const wait = manager.getMinWaitTimeForFamily("claude");
      expect(wait).toBe(30_000);

      vi.useRealTimers();
    });
  });

  describe("getAllBlockedReasons", () => {
    it("reports rate-limits, cooldowns, and disabled accounts accurately", () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);

      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          { email: "user1@example.com", refreshToken: "r1", addedAt: 1, lastUsed: 0, rateLimitResetTimes: { claude: 70_000 } },
          { email: "user2@example.com", refreshToken: "r2", addedAt: 1, lastUsed: 0, coolingDownUntil: 30_000, cooldownReason: "network-error" },
          { email: "user3@example.com", refreshToken: "r3", addedAt: 1, lastUsed: 0, enabled: false, verificationRequired: true },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const reasons = manager.getAllBlockedReasons("claude");

      expect(reasons).toHaveLength(3);
      expect(reasons[0]?.reason).toContain("quota/rate-limited");
      expect(reasons[0]?.waitMs).toBe(60_000);

      expect(reasons[1]?.reason).toContain("cooling down (network-error");
      expect(reasons[1]?.waitMs).toBe(20_000);

      expect(reasons[2]?.reason).toContain("verification required");
      expect(reasons[2]?.waitMs).toBeNull();

      vi.useRealTimers();
    });
  });
});

describe("resolveQuotaGroup", () => {
  it("returns model-based quota group when model is provided", () => {
    expect(resolveQuotaGroup("claude", "claude-opus-4-6-thinking")).toBe("claude");
    expect(resolveQuotaGroup("gemini", "gemini-2.5-pro")).toBe("gemini-pro");
    expect(resolveQuotaGroup("gemini", "gemini-2.5-flash")).toBe("gemini-flash");
  });

  it("falls back to claude for claude family when no model", () => {
    expect(resolveQuotaGroup("claude", null)).toBe("claude");
    expect(resolveQuotaGroup("claude", undefined)).toBe("claude");
  });

  it("falls back to gemini-pro for gemini family when no model", () => {
    expect(resolveQuotaGroup("gemini", null)).toBe("gemini-pro");
    expect(resolveQuotaGroup("gemini", undefined)).toBe("gemini-pro");
  });

  it("model takes precedence over family", () => {
    // Even if family says claude, model determines the quota group
    expect(resolveQuotaGroup("gemini", "gemini-2.5-flash")).toBe("gemini-flash");
    expect(resolveQuotaGroup("gemini", "gemini-3-pro")).toBe("gemini-pro");
  });
});
