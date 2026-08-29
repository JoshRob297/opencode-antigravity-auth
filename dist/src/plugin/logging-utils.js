export function isTruthyFlag(flag) {
    return flag === "1" || flag?.toLowerCase() === "true";
}
export function parseDebugLevel(flag) {
    const trimmed = flag.trim();
    if (trimmed === "2" || trimmed === "verbose")
        return 2;
    if (trimmed === "1" || trimmed === "true")
        return 1;
    return 0;
}
export function deriveDebugPolicy(input) {
    const envDebugFlag = input.envDebugFlag ?? "";
    const debugLevel = input.configDebug
        ? envDebugFlag === "2" || envDebugFlag === "verbose"
            ? 2
            : 1
        : parseDebugLevel(envDebugFlag);
    const debugEnabled = debugLevel >= 1;
    const verboseEnabled = debugLevel >= 2;
    const debugTuiEnabled = debugEnabled && (input.configDebugTui || isTruthyFlag(input.envDebugTuiFlag));
    return {
        debugLevel,
        debugEnabled,
        debugTuiEnabled,
        verboseEnabled,
    };
}
export function formatAccountLabel(email, accountIndex) {
    return email || `Account ${accountIndex + 1}`;
}
export function formatAccountContextLabel(email, accountIndex) {
    if (email) {
        return email;
    }
    if (accountIndex >= 0) {
        return `Account ${accountIndex + 1}`;
    }
    return "All accounts";
}
export function formatErrorForLog(error) {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
export function truncateTextForLog(text, maxChars) {
    if (text.length <= maxChars) {
        return text;
    }
    return `${text.slice(0, maxChars)}... (truncated ${text.length - maxChars} chars)`;
}
export function formatBodyPreviewForLog(body, maxChars) {
    if (body == null) {
        return undefined;
    }
    if (typeof body === "string") {
        return truncateTextForLog(body, maxChars);
    }
    if (body instanceof URLSearchParams) {
        return truncateTextForLog(body.toString(), maxChars);
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
        return `[Blob size=${body.size}]`;
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
        return "[FormData payload omitted]";
    }
    return `[${body.constructor?.name ?? typeof body} payload omitted]`;
}
export function writeConsoleLog(level, ...args) {
    switch (level) {
        case "debug":
            console.debug(...args);
            break;
        case "info":
            console.info(...args);
            break;
        case "warn":
            console.warn(...args);
            break;
        case "error":
            console.error(...args);
            break;
    }
}
//# sourceMappingURL=logging-utils.js.map