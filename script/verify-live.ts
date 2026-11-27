#!/usr/bin/env npx --yes tsx
/**
 * Live smoke test against the real Antigravity backend.
 *
 * Manual by design: it needs the user's OAuth refresh tokens and a real model
 * call, so it must never run in CI. Use it after touching the client signature,
 * the request body, or the endpoint list.
 *
 *   npx --yes tsx script/verify-live.ts
 *   npx --yes tsx script/verify-live.ts --all --model gemini-3.8-flash-high
 *
 * Exit code 1 when a request fails for a reason other than "model not entitled"
 * (404), which is expected on accounts without the grant.
 */
import { ANTIGRAVITY_ENDPOINT_FALLBACKS } from "../src/constants";
import { prepareAntigravityRequest } from "../src/plugin/request";
import { ensureProjectContext } from "../src/plugin/project";
import { loadAccounts } from "../src/plugin/storage";
import { refreshAccessToken } from "../src/plugin/token";
import type { AccountMetadataV3 } from "../src/plugin/storage";

const DEFAULT_MODELS = [
  "gemini-3.8-flash-high",
  "gemini-4-hydrogen-high",
  "claude-sonnet-4-6",
];

const TIMEOUT_MS = 120_000;

interface Args {
  all: boolean;
  account?: string;
  models: string[];
  timeoutMs: number;
}

interface Row {
  account: string;
  model: string;
  status: string;
  detail: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false, models: [], timeoutMs: TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") {
      args.all = true;
    } else if (arg === "--account") {
      args.account = argv[++i];
    } else if (arg === "--model") {
      const model = argv[++i];
      if (model) args.models.push(model);
    } else if (arg === "--timeout") {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) args.timeoutMs = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: verify-live [--all] [--account <email>] [--model <id> ...] [--timeout <ms>]",
      );
      process.exit(0);
    }
  }
  if (args.models.length === 0) args.models = DEFAULT_MODELS;
  return args;
}

function pickAccounts(accounts: AccountMetadataV3[], args: Args): AccountMetadataV3[] {
  const usable = accounts.filter(
    (account) =>
      account.refreshToken && account.enabled !== false && account.suspended !== true,
  );
  if (args.account) {
    const needle = args.account.toLowerCase();
    return usable.filter((account) => (account.email ?? "").toLowerCase().includes(needle));
  }
  return args.all ? usable : usable.slice(0, 1);
}

async function runModel(
  account: AccountMetadataV3,
  model: string,
  accessToken: string,
  projectId: string,
  timeoutMs: number,
): Promise<Row> {
  const label = account.email ?? "account";
  try {
    const prepared = prepareAntigravityRequest(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Responde solo: ok" }] }],
          generationConfig: { maxOutputTokens: 64, temperature: 0 },
        }),
      },
      accessToken,
      projectId,
      ANTIGRAVITY_ENDPOINT_FALLBACKS[0],
      "antigravity",
    );

    const response = await fetch(String(prepared.request), {
      ...prepared.init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    const modelVersion = text.match(/"modelVersion"\s*:\s*"([^"]+)"/)?.[1];
    const errorMessage = text.match(/"message"\s*:\s*"([^"]{0,140})"/)?.[1];

    if (response.ok) {
      return { account: label, model, status: "200", detail: modelVersion ?? "ok" };
    }
    if (response.status === 404) {
      return {
        account: label,
        model,
        status: "404",
        detail: "not entitled (expected on accounts without the grant)",
      };
    }
    return {
      account: label,
      model,
      status: String(response.status),
      detail: errorMessage ?? "request failed",
    };
  } catch (error) {
    return {
      account: label,
      model,
      status: "ERR",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const storage = await loadAccounts();
  if (!storage || storage.accounts.length === 0) {
    console.error("No Antigravity accounts found. Run 'opencode auth login' first.");
    process.exit(1);
  }

  const accounts = pickAccounts(storage.accounts, args);
  if (accounts.length === 0) {
    console.error("No enabled, non-suspended account matches the filter.");
    process.exit(1);
  }

  const client = {
    auth: { set: async () => {} },
    tui: { showToast: async () => {} },
  } as never;

  const rows: Row[] = [];
  for (const account of accounts) {
    const refreshed = await refreshAccessToken(
      { type: "oauth", refresh: account.refreshToken, access: "", expires: 0 },
      client,
      "google",
    );
    if (!refreshed?.access) {
      rows.push({
        account: account.email ?? "account",
        model: "-",
        status: "AUTH",
        detail: "token refresh failed",
      });
      continue;
    }

    const context = await ensureProjectContext(refreshed);
    for (const model of args.models) {
      rows.push(
        await runModel(
          account,
          model,
          context.auth.access ?? refreshed.access,
          context.effectiveProjectId,
          args.timeoutMs,
        ),
      );
    }
  }

  const accountWidth = Math.max(10, ...rows.map((row) => row.account.length));
  const modelWidth = Math.max(10, ...rows.map((row) => row.model.length));
  console.log(
    `${"ACCOUNT".padEnd(accountWidth)}  ${"MODEL".padEnd(modelWidth)}  ${"STATUS".padEnd(7)}DETAIL`,
  );
  console.log("-".repeat(accountWidth + modelWidth + 20));
  for (const row of rows) {
    console.log(
      `${row.account.padEnd(accountWidth)}  ${row.model.padEnd(modelWidth)}  ${row.status.padEnd(7)}${row.detail}`,
    );
  }

  const failures = rows.filter(
    (row) => row.status !== "200" && row.status !== "404",
  );
  console.log(
    `\n${rows.length - failures.length}/${rows.length} checks passed` +
      (failures.length > 0 ? `, ${failures.length} failed` : ""),
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("verify-live failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
