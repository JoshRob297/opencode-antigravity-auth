/**
 * Structured Logger for Antigravity Plugin
 *
 * Logging behavior:
 * - debug controls file logs only (via debug.ts)
 * - debug_tui controls TUI log panel only
 * - either sink can be enabled independently
 * - OPENCODE_ANTIGRAVITY_CONSOLE_LOG=1 → console output (independent of debug flags)
 */
import { isDebugTuiEnabled } from "./debug";
import { isTruthyFlag, writeConsoleLog, } from "./logging-utils";
const ENV_CONSOLE_LOG = "OPENCODE_ANTIGRAVITY_CONSOLE_LOG";
let _client = null;
/**
 * Check if console logging is enabled via environment variable.
 */
function isConsoleLogEnabled() {
    return isTruthyFlag(process.env[ENV_CONSOLE_LOG]);
}
/**
 * Initialize the logger with the plugin client.
 * Must be called during plugin initialization to enable TUI logging.
 */
export function initLogger(client) {
    _client = client;
}
/**
 * Create a logger instance for a specific module.
 *
 * @param module - The module name (e.g., "refresh-queue", "transform.claude")
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const log = createLogger("refresh-queue");
 * log.debug("Checking tokens", { count: 5 });
 * log.warn("Token expired", { accountIndex: 0 });
 * ```
 */
export function createLogger(module) {
    const service = `antigravity.${module}`;
    const log = (level, message, extra) => {
        // TUI logging: controlled only by debug_tui policy
        if (isDebugTuiEnabled()) {
            const app = _client?.app;
            if (app && typeof app.log === "function") {
                app
                    .log({
                    body: { service, level, message, extra },
                })
                    .catch(() => {
                    // Silently ignore logging errors
                });
            }
        }
        // Console fallback: when env var is set (independent of debug flags)
        if (isConsoleLogEnabled()) {
            const prefix = `[${service}]`;
            const args = extra ? [prefix, message, extra] : [prefix, message];
            writeConsoleLog(level, ...args);
        }
        // If neither TUI nor console logging is enabled, log is silently discarded
    };
    return {
        debug: (message, extra) => log("debug", message, extra),
        info: (message, extra) => log("info", message, extra),
        warn: (message, extra) => log("warn", message, extra),
        error: (message, extra) => log("error", message, extra),
    };
}
//# sourceMappingURL=logger.js.map