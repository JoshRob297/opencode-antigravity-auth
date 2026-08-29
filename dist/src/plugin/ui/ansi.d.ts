/**
 * ANSI escape codes and key parsing for interactive CLI menus.
 * Works cross-platform (Windows/Mac/Linux).
 */
export declare const ANSI: {
    readonly hide: "\u001B[?25l";
    readonly show: "\u001B[?25h";
    readonly up: (n?: number) => string;
    readonly down: (n?: number) => string;
    readonly clearLine: "\u001B[2K";
    readonly clearScreen: "\u001B[2J";
    readonly moveTo: (row: number, col: number) => string;
    readonly cyan: "\u001B[36m";
    readonly green: "\u001B[32m";
    readonly red: "\u001B[31m";
    readonly yellow: "\u001B[33m";
    readonly dim: "\u001B[2m";
    readonly bold: "\u001B[1m";
    readonly reset: "\u001B[0m";
    readonly inverse: "\u001B[7m";
};
export type KeyAction = 'up' | 'down' | 'enter' | 'escape' | 'escape-start' | null;
/**
 * Parse raw keyboard input buffer into a key action.
 * Handles Windows/Mac/Linux differences in arrow key sequences.
 */
export declare function parseKey(data: Buffer): KeyAction;
/**
 * Check if the terminal supports interactive input.
 */
export declare function isTTY(): boolean;
//# sourceMappingURL=ansi.d.ts.map