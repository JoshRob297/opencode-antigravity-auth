import { describe, expect, it } from "vitest";
import {
  formatDuration,
  progressBar,
  shortEmail,
  formatQuotaReportMarkdown,
  type AccountQuotaResult,
} from "./quota";

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
  });

  it("builds progress bars correctly", () => {
    expect(progressBar(100)).toBe("[██████████] 100%");
    expect(progressBar(50)).toBe("[█████░░░░░] 50%");
    expect(progressBar(0)).toBe("[░░░░░░░░░░] 0%");
  });

  it("formats dual-window markdown report cleanly", () => {
    const results: AccountQuotaResult[] = [
      {
        index: 0,
        email: "alpha@gmail.com",
        status: "ok",
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
    ];

    const report = formatQuotaReportMarkdown(results);
    expect(report).toContain("# ☁️ Antigravity Quota Status");
    expect(report).toContain("🤖 Gemini Models (Flash / Pro)");
    expect(report).toContain("QUOTA (5h)");
    expect(report).toContain("QUOTA (Weekly)");
    expect(report).toContain("alpha");
  });
});
