/**
 * Gemini-specific Request Transformations
 *
 * Handles Gemini model-specific request transformations including:
 * - Thinking config (camelCase keys, thinkingLevel for Gemini 3)
 * - Tool normalization (function/custom format)
 * - Schema transformation (JSON Schema -> Gemini Schema format)
 */
import type { RequestPayload, ThinkingConfig, ThinkingTier, GoogleSearchConfig } from "./types";
export declare function toGeminiSchema(schema: unknown): unknown;
/**
 * Check if a model is a Gemini model (not Claude).
 */
export declare function isGeminiModel(model: string): boolean;
/**
 * Check if a model is Gemini 3 (uses thinkingLevel string).
 */
export declare function isGemini3Model(model: string): boolean;
/**
 * Check if a model is Gemini 2.5 (uses numeric thinkingBudget).
 */
export declare function isGemini25Model(model: string): boolean;
/**
 * Check if a model is an image generation model.
 * Image models don't support thinking and require imageConfig.
 */
export declare function isImageGenerationModel(model: string): boolean;
/**
 * Build Gemini 3 thinking config with thinkingLevel string.
 */
export declare function buildGemini3ThinkingConfig(includeThoughts: boolean, thinkingLevel: ThinkingTier): ThinkingConfig;
/**
 * Build Gemini 2.5 thinking config with numeric thinkingBudget.
 */
export declare function buildGemini25ThinkingConfig(includeThoughts: boolean, thinkingBudget?: number): ThinkingConfig;
/**
 * Image generation config for Gemini image models.
 *
 * Supported aspect ratios: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
export interface ImageConfig {
    aspectRatio?: string;
}
/**
 * Build image generation config for Gemini image models.
 *
 * Configuration is read from environment variables:
 * - OPENCODE_IMAGE_ASPECT_RATIO: Aspect ratio (e.g., "16:9", "4:3")
 *
 * Defaults to 1:1 aspect ratio if not specified.
 *
 * Note: Resolution setting is not currently supported by the Antigravity API.
 */
export declare function buildImageGenerationConfig(): ImageConfig;
/**
 * Normalize tools for Gemini models.
 * Ensures tools have proper function-style format.
 *
 * @returns Debug info about tool normalization
 */
export declare function normalizeGeminiTools(payload: RequestPayload): {
    toolDebugMissing: number;
    toolDebugSummaries: string[];
};
/**
 * Apply all Gemini-specific transformations to a request payload.
 */
export interface GeminiTransformOptions {
    /** The effective model name (resolved) */
    model: string;
    /** Tier-based thinking budget (from model suffix, for Gemini 2.5) */
    tierThinkingBudget?: number;
    /** Tier-based thinking level (from model suffix, for Gemini 3) */
    tierThinkingLevel?: ThinkingTier;
    /** Normalized thinking config from user settings */
    normalizedThinking?: {
        includeThoughts?: boolean;
        thinkingBudget?: number;
    };
    /** Google Search configuration */
    googleSearch?: GoogleSearchConfig;
}
export interface GeminiTransformResult {
    toolDebugMissing: number;
    toolDebugSummaries: string[];
    /** Number of function declarations after wrapping */
    wrappedFunctionCount: number;
    /** Number of passthrough tools (googleSearch, googleSearchRetrieval, codeExecution) */
    passthroughToolCount: number;
}
/**
 * Apply all Gemini-specific transformations.
 */
export declare function applyGeminiTransforms(payload: RequestPayload, options: GeminiTransformOptions): GeminiTransformResult;
export interface WrapToolsResult {
    wrappedFunctionCount: number;
    passthroughToolCount: number;
}
export declare function wrapToolsAsFunctionDeclarations(payload: RequestPayload): WrapToolsResult;
//# sourceMappingURL=gemini.d.ts.map