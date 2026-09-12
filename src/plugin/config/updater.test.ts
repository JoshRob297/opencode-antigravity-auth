import { describe, test, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  updateOpencodeConfig,
  ensureAntigravityQuotaCommand,
  ANTIGRAVITY_QUOTA_COMMAND_FILENAME,
  ANTIGRAVITY_QUOTA_COMMAND_CONTENT,
} from "./updater";
import { OPENCODE_MODEL_DEFINITIONS } from "./models";

describe("updateOpencodeConfig", () => {
  let tempDir: string;
  let configPath: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-test-"));
    configPath = path.join(tempDir, "opencode.json");
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("creates new config with default structure when file does not exist", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(configPath);
    expect(fs.existsSync(configPath)).toBe(true);

    // Verify written config has correct structure
    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.provider?.google?.models).toBeDefined();
    expect(writtenConfig.provider?.google?.whitelist).toBeDefined();
    expect(writtenConfig.provider?.google?.whitelist).toContain("antigravity-gemini-3.8-flash");
    expect(writtenConfig.provider?.google?.whitelist).not.toContain("antigravity-gemini-3.5-flash");
  });

  test("replaces existing google models with plugin models and updates whitelist", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          models: {
            "old-model": { name: "Old Model" },
          },
          whitelist: ["old-model"],
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // Old model should be replaced
    expect(writtenConfig.provider.google.models["old-model"]).toBeUndefined();
    // New models should be present
    expect(writtenConfig.provider.google.models["antigravity-gemini-3.7-flash"]).toBeDefined();
    expect(writtenConfig.provider.google.models["antigravity-claude-sonnet-4-6"]).toBeDefined();
    expect(writtenConfig.provider.google.models["antigravity-gemini-3.5-flash"]).toBeUndefined();
    // Whitelist should be updated
    expect(writtenConfig.provider.google.whitelist).toContain("antigravity-gemini-3.7-flash");
    expect(writtenConfig.provider.google.whitelist).not.toContain("old-model");
  });

  test("preserves non-google provider sections", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          models: { "old-model": {} },
        },
        anthropic: {
          apiKey: "secret-key",
          models: { "claude-3": {} },
        },
        openai: {
          models: { "gpt-4": {} },
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // Non-google providers should be preserved
    expect(writtenConfig.provider.anthropic).toEqual(existingConfig.provider.anthropic);
    expect(writtenConfig.provider.openai).toEqual(existingConfig.provider.openai);
  });

  test("preserves $schema and other top-level config keys", async () => {
    const existingConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-antigravity-auth@latest", "other-plugin"],
      theme: "dark",
      customSetting: { nested: true },
      provider: {
        google: { models: {} },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
    expect(writtenConfig.plugin).toContain("other-plugin");
    expect(writtenConfig.theme).toBe("dark");
    expect(writtenConfig.customSetting).toEqual({ nested: true });
  });

  test("adds plugin to existing plugin array if not present", async () => {
    const existingConfig = {
      plugin: ["other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.plugin).toContain("other-plugin");
  });

  test("does not duplicate plugin if already present", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest", "other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const pluginCount = writtenConfig.plugin.filter(
      (p: string) => p.includes("opencode-antigravity-auth")
    ).length;
    expect(pluginCount).toBe(1);
  });

  test("does not duplicate plugin if different version present", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@beta", "other-plugin"],
      provider: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const pluginCount = writtenConfig.plugin.filter(
      (p: string) => p.includes("opencode-antigravity-auth")
    ).length;
    // Should not add another version if one exists
    expect(pluginCount).toBe(1);
    // Should preserve the existing version
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@beta");
  });

  test("writes config with proper JSON formatting (2-space indent)", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenContent = fs.readFileSync(configPath, "utf-8");
    // Should have newlines and 2-space indentation
    expect(writtenContent).toContain("\n");
    expect(writtenContent).toMatch(/^\{\n {2}/);
  });

  test("returns error result on invalid JSON in existing config", async () => {
    fs.writeFileSync(configPath, "{ invalid json }");

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("includes all model definitions from OPENCODE_MODEL_DEFINITIONS", async () => {
    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const models = writtenConfig.provider.google.models;

    // Verify all models from OPENCODE_MODEL_DEFINITIONS are included
    for (const modelKey of Object.keys(OPENCODE_MODEL_DEFINITIONS)) {
      expect(models[modelKey]).toBeDefined();
    }
  });

  test("parses existing jsonc config files with comments and trailing commas", async () => {
    const jsoncPath = path.join(tempDir, "opencode.jsonc");
    const existingJsoncConfig = `{
  // Keep existing plugin
  "plugin": [
    "other-plugin",
  ],
  "provider": {
    "google": {
      "region": "us-central1",
    },
  },
}`;
    fs.writeFileSync(jsoncPath, existingJsoncConfig);

    const result = await updateOpencodeConfig({ configPath: jsoncPath });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(jsoncPath);

    const writtenConfig = JSON.parse(fs.readFileSync(jsoncPath, "utf-8"));
    expect(writtenConfig.plugin).toContain("other-plugin");
    expect(writtenConfig.plugin).toContain("opencode-antigravity-auth@latest");
    expect(writtenConfig.provider.google.region).toBe("us-central1");
    expect(writtenConfig.provider.google.models["antigravity-gemini-3.7-flash"]).toBeDefined();
  });

  test("prefers existing opencode.jsonc when using default config path", async () => {
    const opencodeDir = path.join(tempDir, "opencode");
    const jsonPath = path.join(opencodeDir, "opencode.json");
    const jsoncPath = path.join(opencodeDir, "opencode.jsonc");

    fs.mkdirSync(opencodeDir, { recursive: true });
    fs.writeFileSync(jsoncPath, JSON.stringify({ plugin: ["other-plugin"], provider: {} }, null, 2));
    process.env.XDG_CONFIG_HOME = tempDir;

    const result = await updateOpencodeConfig();

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(jsoncPath);
    expect(fs.existsSync(jsonPath)).toBe(false);
    expect(fs.existsSync(jsoncPath)).toBe(true);
  });

  test("creates parent directory if it does not exist", async () => {
    const nestedPath = path.join(tempDir, "nested", "dir", "opencode.json");

    const result = await updateOpencodeConfig({ configPath: nestedPath });

    expect(result.success).toBe(true);
    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  test("adds $schema if missing from existing config", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest"],
      provider: { google: {} },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(writtenConfig.$schema).toBe("https://opencode.ai/config.json");
  });

  test("preserves other google provider settings besides models", async () => {
    const existingConfig = {
      plugin: ["opencode-antigravity-auth@latest"],
      provider: {
        google: {
          apiKey: "test-key",
          models: { "old-model": {} },
          customSetting: true,
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existingConfig));

    const result = await updateOpencodeConfig({ configPath });

    expect(result.success).toBe(true);

    const writtenConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    // Other google settings should be preserved
    expect(writtenConfig.provider.google.apiKey).toBe("test-key");
    expect(writtenConfig.provider.google.customSetting).toBe(true);
    // But models should be replaced
    expect(writtenConfig.provider.google.models["old-model"]).toBeUndefined();
  });

  test("ensureAntigravityQuotaCommand installs /antigravity-quota.md in command directory", () => {
    const customConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-cmd-test-"));
    const createdPath = ensureAntigravityQuotaCommand(customConfigDir);

    expect(createdPath).toBe(path.join(customConfigDir, "command", ANTIGRAVITY_QUOTA_COMMAND_FILENAME));
    expect(fs.existsSync(createdPath)).toBe(true);

    const content = fs.readFileSync(createdPath, "utf-8");
    expect(content).toBe(ANTIGRAVITY_QUOTA_COMMAND_CONTENT);
    expect(content).toContain("antigravity_quota()");

    // Calling it again should preserve the existing file without throwing
    expect(() => ensureAntigravityQuotaCommand(customConfigDir)).not.toThrow();

    fs.rmSync(customConfigDir, { recursive: true, force: true });
  });
});
