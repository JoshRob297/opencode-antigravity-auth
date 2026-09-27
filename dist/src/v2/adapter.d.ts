/**
 * OpenCode v2 Plugin Adapter
 *
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */
export interface V2Context {
    readonly app?: any;
    readonly location?: {
        directory?: string;
    };
    readonly session?: {
        hook: (name: string, callback: (event: any) => Promise<void> | void, options?: any) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
    readonly model?: {
        transform: (callback: (editor: any) => void) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
    readonly tool?: {
        transform: (callback: (editor: any) => void) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
    readonly command?: {
        transform: (callback: (editor: any) => void) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
    readonly provider?: {
        transform: (callback: (editor: any) => void) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
    readonly integration?: {
        transform: (callback: (editor: any) => void) => Promise<{
            dispose: () => Promise<void>;
        }>;
    };
}
export type CleanupFunction = () => Promise<void> | void;
/**
 * OpenCode v2 setup hook.
 * Called automatically by the v2 plugin supervisor during startup.
 */
export declare function setupV2(context: V2Context): Promise<CleanupFunction | void>;
//# sourceMappingURL=adapter.d.ts.map