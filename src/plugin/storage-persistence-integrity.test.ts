import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getStoragePath,
  loadAccounts,
  saveAccounts,
  saveAccountsReplace,
  type AccountStorageV4,
} from "./storage";
import { AccountManager } from "./accounts";
import { persistAccountPool } from "../plugin";

let configDir: string;
let previousConfigDir: string | undefined;

function account(email: string, refreshToken: string): AccountStorageV4["accounts"][number] {
  return {
    email,
    refreshToken,
    projectId: `project-${refreshToken}`,
    addedAt: 1,
    lastUsed: 0,
    enabled: true,
  };
}

async function seed(accounts: AccountStorageV4["accounts"]): Promise<void> {
  await saveAccountsReplace({
    version: 4,
    accounts,
    activeIndex: 0,
    activeIndexByFamily: { claude: 0, gemini: 0 },
  });
}

async function readStorage(): Promise<AccountStorageV4> {
  return JSON.parse(await readFile(getStoragePath(), "utf-8")) as AccountStorageV4;
}

beforeEach(async () => {
  previousConfigDir = process.env.OPENCODE_CONFIG_DIR;
  configDir = await mkdtemp(join(tmpdir(), "antigravity-storage-integrity-"));
  process.env.OPENCODE_CONFIG_DIR = configDir;
});

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
  } else {
    process.env.OPENCODE_CONFIG_DIR = previousConfigDir;
  }
  await rm(configDir, { recursive: true, force: true });
});

describe("storage persistence integrity", () => {
  it("removes an account from disk when the manager drops it", async () => {
    await seed([account("alpha@example.com", "rt-alpha"), account("beta@example.com", "rt-beta")]);

    const manager = await AccountManager.loadFromDisk();
    expect(manager.getAccountCount()).toBe(2);

    expect(manager.removeAccountByIndex(0)).toBe(true);
    await manager.saveToDisk();

    const stored = await readStorage();
    expect(stored.accounts.map((a) => a.email)).toEqual(["beta@example.com"]);
    expect(manager.getAccountCount()).toBe(1);
  });

  it("replaces the pool on a fresh login instead of merging old accounts back", async () => {
    await seed([account("alpha@example.com", "rt-alpha"), account("beta@example.com", "rt-beta")]);

    await persistAccountPool(
      [
        {
          type: "success",
          refresh: "rt-gamma|project-rt-gamma",
          access: "access-gamma",
          expires: Date.now() + 3600_000,
          email: "gamma@example.com",
          projectId: "project-rt-gamma",
        },
      ],
      true,
    );

    const stored = await readStorage();
    expect(stored.accounts.map((a) => a.email)).toEqual(["gamma@example.com"]);
    expect(stored.activeIndex).toBe(0);
  });

  it("surfaces a truncated storage file instead of treating it as an empty pool", async () => {
    const corrupted = '{"version":4,"accounts":[{"refreshToken":"rt-alpha"}';
    await writeFile(getStoragePath(), corrupted, "utf-8");

    await expect(loadAccounts()).rejects.toThrow();

    // The next write must not destroy a file it could not parse.
    await expect(
      saveAccounts({
        version: 4,
        accounts: [account("beta@example.com", "rt-beta")],
        activeIndex: 0,
      }),
    ).rejects.toThrow();

    expect(await readFile(getStoragePath(), "utf-8")).toBe(corrupted);
  });

  it("surfaces an invalid storage shape instead of treating it as an empty pool", async () => {
    const invalid = JSON.stringify({ version: 4, accounts: "not-an-array" });
    await writeFile(getStoragePath(), invalid, "utf-8");

    await expect(loadAccounts()).rejects.toThrow();
    expect(await readFile(getStoragePath(), "utf-8")).toBe(invalid);
  });

  it("still treats a missing storage file as an empty pool", async () => {
    await expect(loadAccounts()).resolves.toBeNull();
  });
});
