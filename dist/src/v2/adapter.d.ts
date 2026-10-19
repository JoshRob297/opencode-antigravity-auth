/**
 * OpenCode v2 Plugin Adapter
 *
 * Provides native compatibility with the @opencode/plugin v2 specification
 * (OpenCode v2.0+) while sharing backend logic, accounts, and tools with v1.
 */
/**
 * OpenCode v2 domain contracts (2.0.x / @opencode/plugin 2.0.24).
 *
 * These are intentionally declared locally (no runtime dependency on
 * `@opencode/plugin`) so the plugin keeps loading from a plain directory or git
 * install without pulling Effect/@opencode/client into the tree. Shapes mirror
 * `@opencode/plugin/dist/promise/*.d.ts`.
 */
export interface V2Registration {
    dispose: () => Promise<void>;
}
export interface V2LocationInfo {
    readonly directory?: string;
    readonly workspaceID?: string;
    readonly project?: {
        readonly id?: string;
        readonly directory?: string;
        readonly canonical?: string;
    };
}
/** Credential stored by OpenCode core after an OAuth authorization. */
export interface V2OAuthCredential {
    type: "oauth";
    methodID: string;
    refresh: string;
    access: string;
    expires: number;
    metadata?: Record<string, unknown>;
}
export type V2OAuthAuthorization = {
    readonly url: string;
    readonly instructions: string;
    readonly expiresAt?: number;
} & ({
    readonly mode: "auto";
    readonly callback: Promise<V2OAuthCredential>;
} | {
    readonly mode: "code";
    readonly callback: (code: string) => Promise<V2OAuthCredential>;
});
export interface V2IntegrationRef {
    id: string;
    name: string;
}
export type V2IntegrationMethod = {
    readonly id: string;
    readonly type: "oauth";
    readonly label: string;
    readonly form?: unknown;
} | {
    readonly id: string;
    readonly type: "command";
    readonly label: string;
    readonly command: ReadonlyArray<string>;
} | {
    readonly type: "key";
    readonly label?: string;
    readonly form?: unknown;
} | {
    readonly type: "env";
    readonly names: ReadonlyArray<string>;
};
export type V2IntegrationMethodRegistration = {
    readonly integrationID: string;
    readonly method: {
        readonly id: string;
        readonly type: "oauth";
        readonly label: string;
        readonly form?: unknown;
    };
    readonly authorize: (answer: Record<string, unknown>) => Promise<V2OAuthAuthorization>;
    readonly refresh?: (credential: V2OAuthCredential) => Promise<V2OAuthCredential>;
    readonly label?: (credential: V2OAuthCredential) => string | undefined;
} | {
    readonly integrationID: string;
    readonly method: {
        readonly id: string;
        readonly type: "command";
        readonly label: string;
        readonly command: ReadonlyArray<string>;
    };
} | {
    readonly integrationID: string;
    readonly method: {
        readonly type: "key";
        readonly label?: string;
        readonly form?: unknown;
    };
} | {
    readonly integrationID: string;
    readonly method: {
        readonly type: "env";
        readonly names: ReadonlyArray<string>;
    };
};
export interface V2IntegrationEditor {
    list(): readonly V2IntegrationRef[];
    get(id: string): V2IntegrationRef | undefined;
    update(id: string, update: (integration: {
        id: string;
        name: string;
    }) => void): void;
    remove(id: string): void;
    readonly method: {
        list(integrationID: string): readonly V2IntegrationMethod[];
        update(input: V2IntegrationMethodRegistration): void;
        remove(integrationID: string, method: V2IntegrationMethod): void;
    };
}
export interface V2ModelVariant {
    id: string;
    settings?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
}
export interface V2ModelDraft {
    id: string;
    modelID: string;
    providerID: string;
    name: string;
    status: "alpha" | "beta" | "deprecated" | "active";
    enabled: boolean;
    limit: {
        context: number;
        input?: number;
        output: number;
    };
    capabilities: {
        tools: boolean;
        input: string[];
        output: string[];
    };
    variants: V2ModelVariant[];
    [key: string]: unknown;
}
export interface V2ModelEditor {
    list(providerID?: string): readonly V2ModelDraft[];
    get(providerID: string, modelID: string): V2ModelDraft | undefined;
    /** Edits raw model overrides; adds a model only under an available provider. */
    update(providerID: string, modelID: string, update: (model: V2ModelDraft) => void): void;
    remove(providerID: string, modelID: string): void;
    readonly default: {
        get(): {
            providerID: string;
            modelID: string;
        } | undefined;
        set(providerID: string, modelID: string): void;
    };
    readonly provider: {
        list(): readonly {
            readonly provider: {
                readonly id: string;
            };
        }[];
        get(providerID: string): {
            readonly provider: {
                readonly id: string;
            };
        } | undefined;
    };
}
export interface V2ToolResult {
    content?: string | ReadonlyArray<{
        type: string;
        text?: string;
        uri?: string;
        mime?: string;
        name?: string;
    }>;
    output?: unknown;
    metadata?: Record<string, unknown>;
}
export interface V2ToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly input: unknown;
    readonly execute: (input: any, context: any) => Promise<V2ToolResult>;
    readonly output?: unknown;
    readonly options?: unknown;
}
export interface V2ToolEditor {
    list(): readonly (V2ToolDefinition & {
        readonly id: string;
    })[];
    get(id: string): (V2ToolDefinition & {
        readonly id: string;
    }) | undefined;
    namespace(namespace: {
        name: string;
        description: string;
    }): void;
    add(tool: V2ToolDefinition): void;
    update(id: string, update: (tool: V2ToolDefinition) => void): void;
    remove(id: string): void;
}
export interface V2CommandInvocation {
    readonly sessionID: string;
    readonly prompt: unknown;
    readonly delivery: "steer" | "queue";
}
export interface V2CommandDefinition {
    readonly name: string;
    readonly description?: string;
    readonly execute: (input: V2CommandInvocation) => Promise<void>;
}
export interface V2CommandEditor {
    add(definition: V2CommandDefinition): void;
}
export interface V2SessionDomain {
    hook: (name: string, callback: (event: any) => Promise<void> | void, options?: {
        providerID?: string;
    }) => Promise<V2Registration>;
    /** Admits a non-model message into the session transcript (used to display command output). */
    synthetic?: (input: {
        sessionID: string;
        text: string;
    }) => Promise<unknown>;
    prompt?: (input: {
        sessionID: string;
        text: string;
        delivery?: "steer" | "queue";
    }) => Promise<unknown>;
}
export interface V2Context {
    readonly app?: {
        readonly version?: string;
    };
    readonly location?: V2LocationInfo;
    readonly session?: V2SessionDomain;
    readonly model?: {
        transform: (callback: (editor: V2ModelEditor) => void) => Promise<V2Registration>;
        reload?: () => Promise<void>;
    };
    readonly provider?: {
        transform: (callback: (editor: any) => void) => Promise<V2Registration>;
        reload?: () => Promise<void>;
    };
    readonly tool?: {
        transform: (callback: (editor: V2ToolEditor) => void) => Promise<V2Registration>;
        reload?: () => Promise<void>;
    };
    readonly command?: {
        transform: (callback: (editor: V2CommandEditor) => void) => Promise<V2Registration>;
        reload?: () => Promise<void>;
    };
    readonly integration?: {
        transform: (callback: (editor: V2IntegrationEditor) => void) => Promise<V2Registration>;
        reload?: () => Promise<void>;
    };
}
export type CleanupFunction = () => Promise<void> | void;
/**
 * OpenCode v2 setup hook.
 * Called automatically by the v2 plugin supervisor during startup.
 */
/**
 * Disables every model of a provider that is not part of the curated catalog.
 *
 * models.dev publishes a `google` provider with the full Gemini lineup. The
 * Antigravity OAuth credential makes that provider available, so all of those
 * models show up in the picker even though only the curated Antigravity ones
 * can be served. Returns how many entries were disabled.
 *
 * Fail-open: an editor without `list`, or any throw, leaves the list untouched.
 */
export declare function hideForeignModels(editor: any, providerID: string, curatedIds: Set<string>): number;
export declare function setupV2(context: V2Context): Promise<CleanupFunction | void>;
//# sourceMappingURL=adapter.d.ts.map