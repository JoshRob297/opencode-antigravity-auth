import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupV2, type V2Context } from "./adapter";
import { saveAccountsReplace } from "../plugin/storage";
import { formatRefreshParts } from "../plugin/auth";
import { storeCachedAuth } from "../plugin/cache";
import { readUsage } from "../plugin/usage-ledger";

let root: string;
let configDir: string;
let ledgerDir: string;
let previousConfigDir: string | undefined;
let previousLedgerDir: string | undefined;

const now = Date.now();

function sseWithUsage(input: number, output: number, reasoning: number): string {
  return (
    "data: " +
    JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
        usageMetadata: {
          promptTokenCount: input,
          candidatesTokenCount: output,
          thoughtsTokenCount: reasoning,
          totalTokenCount: input + output + reasoning,
        },
      },
    }) +
    "\n\n" +
    "data: [DONE]\n\n"
  );
}

beforeEach(async () => {
  previousConfigDir = process.env.OPENCODE_CONFIG_DIR;
  previousLedgerDir = process.env.ANTIGRAVITY_LEDGER_DIR;
  root = await mkdtemp(join(tmpdir(), "antigravity-usage-attribution-"));
  configDir = join(root, "config");
  ledgerDir = join(root, "ledger");
  await mkdir(configDir, { recursive: true });
  await mkdir(ledgerDir, { recursive: true });
  process.env.OPENCODE_CONFIG_DIR = configDir;
  process.env.ANTIGRAVITY_LEDGER_DIR = ledgerDir;

  await writeFile(
    join(configDir, "antigravity.json"),
    JSON.stringify({ account_selection_strategy: "round-robin" }),
    "utf-8",
  );

  const catalog = {
    updatedAt: now,
    models: { "gemini-3.8-flash-tiered": { displayName: "Gemini 3.8 Flash" } },
  };
  const quota = { "gemini-flash": { remainingFraction: 1 } };
  await saveAccountsReplace({
    version: 4,
    activeIndex: 0,
    activeIndexByFamily: { claude: 0, gemini: 0 },
    accounts: [
      {
        email: "alpha@example.com",
        refreshToken: "rt-alpha",
        projectId: "project-alpha",
        addedAt: now,
        lastUsed: 0,
        enabled: true,
        cachedQuota: quota,
        cachedQuotaUpdatedAt: now,
        modelCatalog: catalog,
      },
      {
        email: "beta@example.com",
        refreshToken: "rt-beta",
        projectId: "project-beta",
        addedAt: now,
        lastUsed: 0,
        enabled: true,
        cachedQuota: quota,
        cachedQuotaUpdatedAt: now,
        modelCatalog: catalog,
      },
    ],
  });

  for (const [email, refreshToken, projectId] of [
    ["alpha@example.com", "rt-alpha", "project-alpha"],
    ["beta@example.com", "rt-beta", "project-beta"],
  ] as const) {
    storeCachedAuth({
      type: "oauth",
      refresh: formatRefreshParts({ refreshToken, projectId }),
      access: `access-${email.split("@")[0]}`,
      expires: now + 3600_000,
    });
  }
});

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR;
  else process.env.OPENCODE_CONFIG_DIR = previousConfigDir;
  if (previousLedgerDir === undefined) delete process.env.ANTIGRAVITY_LEDGER_DIR;
  else process.env.ANTIGRAVITY_LEDGER_DIR = previousLedgerDir;
  await rm(root, { recursive: true, force: true });
});

describe("v2 adapter usage attribution", () => {
  it("credits each concurrent round-robin request to the account that served it", async () => {
    const registeredHooks: Record<string, Function> = {};
    const mockContext: V2Context = {
      location: { directory: root },
      session: {
        hook: vi.fn().mockImplementation(async (name, callback) => {
          registeredHooks[name] = callback;
          return { dispose: async () => {} };
        }),
      },
    };

    const cleanup = await setupV2(mockContext);
    const requestHook = registeredHooks["http.request"];
    const responseHook = registeredHooks["http.response"];
    expect(requestHook).toBeDefined();
    expect(responseHook).toBeDefined();
    if (!requestHook || !responseHook) return;

    const sessionID = "ses-usage-attribution";
    const makeRequest = (text: string): any => ({
      sessionID,
      request: new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
        },
      ),
    });

    const req1 = makeRequest("first");
    const req2 = makeRequest("second");
    await requestHook(req1);
    await requestHook(req2);

    // Round-robin must have served the two concurrent requests from different accounts.
    expect(req1.request.headers.get("authorization")).toBe("Bearer access-alpha");
    expect(req2.request.headers.get("authorization")).toBe("Bearer access-beta");

    // Both requests were in flight together. The session-wide "last attempt"
    // scalar already points at beta, so a correct fix must use each request's
    // own queue entry instead: response 1 belongs to alpha, response 2 to beta.
    const resp1: any = {
      sessionID,
      response: new Response(sseWithUsage(10, 3, 2), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    };
    await responseHook(resp1);
    await resp1.response.text();

    const resp2: any = {
      sessionID,
      response: new Response(sseWithUsage(20, 5, 1), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    };
    await responseHook(resp2);
    await resp2.response.text();

    const rows = readUsage().filter((row) => row.session === sessionID);
    expect(rows.map((row) => row.account)).toEqual(["alpha@example.com", "beta@example.com"]);
    expect(rows.map((row) => row.input)).toEqual([10, 20]);

    if (typeof cleanup === "function") cleanup();
  }, 20000);
});
