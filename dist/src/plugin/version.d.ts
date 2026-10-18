/**
 * Remote Antigravity version fetcher.
 *
 * Mirrors the Antigravity-Manager's version resolution strategy:
 *   1. Auto-updater API (plain text with semver)
 *   2. Changelog page scrape (first 5000 chars)
 *   3. Hardcoded fallback in constants.ts
 *
 * Called once at plugin startup to ensure headers use the latest
 * supported version, avoiding "version no longer supported" errors.
 *
 * @see https://github.com/lbjlaq/Antigravity-Manager (src-tauri/src/constants.rs)
 */
/**
 * Antigravity **CLI** auto-updater. Separate product, separate endpoint, and the
 * only source for the CLI version: the CLI client signature that Gemini 3.7/3.8
 * Flash require carries `antigravity/cli/<version>`, so a stale value here is a
 * silent drift risk.
 */
export declare const CLI_VERSION_URL = "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app";
/**
 * Fetch the latest Antigravity version and update the global constant.
 * Safe to call before logger is initialized (will silently skip logging).
 */
export declare function initAntigravityVersion(): Promise<void>;
/**
 * Fetch the latest Antigravity **CLI** (agy) version and update the global constant.
 *
 * The CLI exposes a single source (its auto-updater endpoint, plain text with a
 * semver). There is no changelog fallback: if the fetch fails the hardcoded
 * fallback is kept, which is the same behaviour the IDE version had before this
 * existed - the point is that it is now refreshed at startup instead of silently
 * ageing in the source.
 */
export declare function initAntigravityCliVersion(): Promise<void>;
//# sourceMappingURL=version.d.ts.map