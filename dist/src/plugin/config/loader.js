/**
 * Configuration loader for opencode-antigravity-auth plugin.
 *
 * Loads config from files.
 * Priority (lowest to highest):
 * 1. Schema defaults
 * 2. User config file
 * 3. Project config file
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { AntigravityConfigSchema, DEFAULT_CONFIG } from "./schema";
import { createLogger } from "../logger";
const log = createLogger("config");
// =============================================================================
// Path Utilities
// =============================================================================
/**
 * Get the config directory path, with the following precedence:
 * 1. OPENCODE_CONFIG_DIR env var (if set)
 * 2. ~/.config/opencode (all platforms, including Windows)
 */
function getConfigDir() {
    // 1. Check for explicit override via env var
    if (process.env.OPENCODE_CONFIG_DIR) {
        return process.env.OPENCODE_CONFIG_DIR;
    }
    // 2. Use ~/.config/opencode on all platforms (including Windows)
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgConfig, "opencode");
}
/**
 * Get the user-level config file path.
 */
export function getUserConfigPath() {
    return join(getConfigDir(), "antigravity.json");
}
/**
 * Get the project-level config file path.
 */
export function getProjectConfigPath(directory) {
    return join(directory, ".opencode", "antigravity.json");
}
// =============================================================================
// Config Loading
// =============================================================================
/**
 * Load and parse a config file, returning null if not found or invalid.
 */
function loadConfigFile(path) {
    try {
        if (!existsSync(path)) {
            return null;
        }
        const content = readFileSync(path, "utf-8");
        const rawConfig = JSON.parse(content);
        // Validate with Zod (partial - we'll merge with defaults later)
        const result = AntigravityConfigSchema.partial().safeParse(rawConfig);
        if (!result.success) {
            log.warn("Config validation error", {
                path,
                issues: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", "),
            });
            return null;
        }
        return result.data;
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            log.warn("Invalid JSON in config file", { path, error: error.message });
        }
        else {
            log.warn("Failed to load config file", { path, error: String(error) });
        }
        return null;
    }
}
/**
 * Deep merge two config objects, with override taking precedence.
 */
function mergeConfigs(base, override) {
    return {
        ...base,
        ...override,
        // Deep merge signature_cache if both exist
        signature_cache: override.signature_cache
            ? {
                ...base.signature_cache,
                ...override.signature_cache,
            }
            : base.signature_cache,
    };
}
// =============================================================================
// Main Loader
// =============================================================================
/**
 * Load the complete configuration.
 *
 * @param directory - The project directory (for project-level config)
 * @returns Fully resolved configuration
 */
export function loadConfig(directory) {
    // Start with defaults
    let config = { ...DEFAULT_CONFIG };
    // Load user config file (if exists)
    const userConfigPath = getUserConfigPath();
    const userConfig = loadConfigFile(userConfigPath);
    if (userConfig) {
        config = mergeConfigs(config, userConfig);
    }
    // Load project config file (if exists) - overrides user config
    const projectConfigPath = getProjectConfigPath(directory);
    const projectConfig = loadConfigFile(projectConfigPath);
    if (projectConfig) {
        config = mergeConfigs(config, projectConfig);
    }
    return config;
}
/**
 * Check if a config file exists at the given path.
 */
export function configExists(path) {
    return existsSync(path);
}
/**
 * Get the default logs directory.
 */
export function getDefaultLogsDir() {
    return join(getConfigDir(), "antigravity-logs");
}
let runtimeConfig = null;
export function initRuntimeConfig(config) {
    runtimeConfig = config;
}
export function getKeepThinking() {
    return runtimeConfig?.keep_thinking ?? false;
}
//# sourceMappingURL=loader.js.map