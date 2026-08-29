import { debugLogToFile } from "../../plugin/debug";
const AUTO_UPDATE_LOG_PREFIX = "[auto-update-checker]";
export function formatAutoUpdateLogMessage(message) {
    return `${AUTO_UPDATE_LOG_PREFIX} ${message}`;
}
export function logAutoUpdate(message) {
    debugLogToFile(formatAutoUpdateLogMessage(message));
}
//# sourceMappingURL=logging.js.map