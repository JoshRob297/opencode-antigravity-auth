export type LogLevel = "debug" | "info" | "warn" | "error";
export interface DebugPolicyInput {
    configDebug: boolean;
    configDebugTui: boolean;
    envDebugFlag?: string;
    envDebugTuiFlag?: string;
}
export interface DebugPolicy {
    debugLevel: number;
    debugEnabled: boolean;
    debugTuiEnabled: boolean;
    verboseEnabled: boolean;
}
export declare function isTruthyFlag(flag?: string): boolean;
export declare function parseDebugLevel(flag: string): number;
export declare function deriveDebugPolicy(input: DebugPolicyInput): DebugPolicy;
export declare function formatAccountLabel(email: string | undefined, accountIndex: number): string;
export declare function formatAccountContextLabel(email: string | undefined, accountIndex: number): string;
export declare function formatErrorForLog(error: unknown): string;
export declare function truncateTextForLog(text: string, maxChars: number): string;
export declare function formatBodyPreviewForLog(body: BodyInit | null | undefined, maxChars: number): string | undefined;
export declare function writeConsoleLog(level: LogLevel, ...args: unknown[]): void;
//# sourceMappingURL=logging-utils.d.ts.map