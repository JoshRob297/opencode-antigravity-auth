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
import { getAntigravityVersion, setAntigravityVersion, getAntigravityCliVersion, setAntigravityCliVersion, } from "../constants";
import { createLogger } from "./logger";
const VERSION_URL = "https://antigravity-auto-updater-974169037036.us-central1.run.app";
const CHANGELOG_URL = "https://antigravity.google/changelog";
/**
 * Antigravity **CLI** auto-updater. Separate product, separate endpoint, and the
 * only source for the CLI version: the CLI client signature that Gemini 3.7/3.8
 * Flash require carries `antigravity/cli/<version>`, so a stale value here is a
 * silent drift risk.
 */
export const CLI_VERSION_URL = "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app";
const FETCH_TIMEOUT_MS = 5000;
const CHANGELOG_SCAN_CHARS = 5000;
const VERSION_REGEX = /\d+\.\d+\.\d+/;
function parseVersion(text) {
    const match = text.match(VERSION_REGEX);
    return match ? match[0] : null;
}
async function tryFetchVersion(url, maxChars) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            return null;
        let text = await response.text();
        if (maxChars)
            text = text.slice(0, maxChars);
        return parseVersion(text);
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Fetch the latest Antigravity version and update the global constant.
 * Safe to call before logger is initialized (will silently skip logging).
 */
export async function initAntigravityVersion() {
    const log = createLogger("version");
    const fallback = getAntigravityVersion();
    let version;
    let source;
    // 1. Try auto-updater API
    version = await tryFetchVersion(VERSION_URL);
    if (version) {
        source = "api";
    }
    else {
        // 2. Try changelog page scrape
        version = await tryFetchVersion(CHANGELOG_URL, CHANGELOG_SCAN_CHARS);
        if (version) {
            source = "changelog";
        }
        else {
            // 3. Fall back to hardcoded
            source = "fallback";
            setAntigravityVersion(fallback);
            log.info("version-fetch-failed", { fallback });
            return;
        }
    }
    if (version !== fallback) {
        log.info("version-updated", { version, source, previous: fallback });
    }
    else {
        log.debug("version-unchanged", { version, source });
    }
    setAntigravityVersion(version);
}
/**
 * Fetch the latest Antigravity **CLI** (agy) version and update the global constant.
 *
 * The CLI exposes a single source (its auto-updater endpoint, plain text with a
 * semver). There is no changelog fallback: if the fetch fails the hardcoded
 * fallback is kept, which is the same behaviour the IDE version had before this
 * existed - the point is that it is now refreshed at startup instead of silently
 * ageing in the source.
 */
export async function initAntigravityCliVersion() {
    const log = createLogger("version");
    const fallback = getAntigravityCliVersion();
    const version = await tryFetchVersion(CLI_VERSION_URL);
    if (!version) {
        log.info("cli-version-fetch-failed", { fallback });
        return;
    }
    if (version !== fallback) {
        log.info("cli-version-updated", { version, previous: fallback });
    }
    else {
        log.debug("cli-version-unchanged", { version });
    }
    setAntigravityCliVersion(version);
}
//# sourceMappingURL=version.js.map