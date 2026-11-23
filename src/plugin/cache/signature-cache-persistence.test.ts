import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignatureCache } from "./signature-cache";

let configHome: string;
let previousXdg: string | undefined;

const config = {
  enabled: true,
  memory_ttl_seconds: 3600,
  disk_ttl_seconds: 172800,
  write_interval_seconds: 3600,
};

beforeEach(async () => {
  previousXdg = process.env.XDG_CONFIG_HOME;
  configHome = await mkdtemp(join(tmpdir(), "antigravity-signature-cache-"));
  process.env.XDG_CONFIG_HOME = configHome;
});

afterEach(async () => {
  if (previousXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = previousXdg;
  }
  await rm(configHome, { recursive: true, force: true });
});

describe("signature cache disk persistence", () => {
  it("restores thinking text and tool ids after a restart", async () => {
    const key = "session-1:antigravity-claude-sonnet-4-6";
    const thinkingText = "I should inspect the failing test before editing the implementation.";
    const signature = "signed-thinking-block";

    const first = new SignatureCache(config);
    first.storeThinking(key, thinkingText, signature, ["tool-call-1"]);
    await expect(first.flush()).resolves.toBe(true);
    first.shutdown();

    const second = new SignatureCache(config);
    expect(second.retrieveThinking(key)).toEqual({
      text: thinkingText,
      signature,
      toolIds: ["tool-call-1"],
    });
    expect(second.getStats().diskHits).toBe(1);
    second.shutdown();
  });

  it("keeps thinking text when a restarted cache saves again", async () => {
    const key = "session-2:antigravity-claude-sonnet-4-6";
    const thinkingText = "This text must survive a second disk round trip.";

    const first = new SignatureCache(config);
    first.storeThinking(key, thinkingText, "signature-2");
    await first.flush();
    first.shutdown();

    const second = new SignatureCache(config);
    expect(second.retrieveThinking(key)?.text).toBe(thinkingText);
    await second.flush();
    second.shutdown();

    const third = new SignatureCache(config);
    expect(third.retrieveThinking(key)).toEqual({
      text: thinkingText,
      signature: "signature-2",
      toolIds: undefined,
    });
    third.shutdown();
  });
});
