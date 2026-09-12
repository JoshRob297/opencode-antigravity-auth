import type { ProviderModel } from "../types";
export type ModelThinkingLevel = "minimal" | "low" | "medium" | "high";
export interface ModelThinkingConfig {
    thinkingBudget: number;
}
export interface ModelVariant {
    thinkingLevel?: ModelThinkingLevel;
    thinkingConfig?: ModelThinkingConfig;
}
export interface ModelLimit {
    context: number;
    output: number;
}
export type ModelModality = "text" | "image" | "pdf";
export interface ModelModalities {
    input: ModelModality[];
    output: ModelModality[];
}
export interface OpencodeModelDefinition extends ProviderModel {
    name: string;
    limit: ModelLimit;
    modalities: ModelModalities;
    variants?: Record<string, ModelVariant>;
}
export type OpencodeModelDefinitions = Record<string, OpencodeModelDefinition>;
export declare const OPENCODE_MODEL_DEFINITIONS: OpencodeModelDefinitions;
/**
 * List of Antigravity model IDs to whitelist in OpenCode configuration.
 * Prevents OpenCode from showing 18+ unauthenticated built-in Google models.
 */
export declare const OPENCODE_WHITELIST_MODELS: string[];
//# sourceMappingURL=models.d.ts.map