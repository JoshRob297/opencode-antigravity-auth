/**
 * Model Resolution with Thinking Tier Support
 *
 * Resolves model names with tier suffixes (e.g., gemini-3-pro-high, claude-opus-4-6-thinking-low)
 * to their actual API model names and corresponding thinking configurations.
 */
import type { ResolvedModel, GoogleSearchConfig } from "./types";
export interface ModelResolverOptions {
    cli_first?: boolean;
}
/**
 * Thinking tier budgets by model family.
 * Claude and Gemini 2.5 Pro use numeric budgets.
 */
export declare const THINKING_TIER_BUDGETS: {
    readonly claude: {
        readonly low: 8192;
        readonly medium: 16384;
        readonly high: 32768;
    };
    readonly "gemini-2.5-pro": {
        readonly low: 8192;
        readonly medium: 16384;
        readonly high: 32768;
    };
    readonly "gemini-2.5-flash": {
        readonly low: 6144;
        readonly medium: 12288;
        readonly high: 24576;
    };
    readonly default: {
        readonly low: 4096;
        readonly medium: 8192;
        readonly high: 16384;
    };
};
/**
 * Gemini 3 uses thinkingLevel strings instead of numeric budgets.
 * Flash supports: minimal, low, medium, high
 * Pro supports: low, high (no minimal/medium)
 */
export declare const GEMINI_3_THINKING_LEVELS: readonly ["minimal", "low", "medium", "high"];
/**
 * Model aliases - maps user-friendly names to API model names.
 *
 * Format:
 * - Gemini 3 Pro variants: gemini-3-pro-{low,medium,high}
 * - Claude thinking variants: claude-{model}-thinking-{low,medium,high}
 * - Claude non-thinking: claude-{model} (no -thinking suffix)
 */
export declare const MODEL_ALIASES: Record<string, string>;
/**
 * Cloud Code does not expose a bare `gemini-3.5-flash` backend id.
 * Antigravity/agy resolves the UI model to these advertised ids instead.
 */
export declare function resolveAntigravityGemini35FlashBackendModel(model: string, thinkingLevel?: string): string | undefined;
/**
 * Resolves Gemini 3.6 Flash to backend model ID with tier suffix.
 * Backend expects gemini-3.6-flash-{low|medium|high}.
 */
export declare function resolveAntigravityGemini36FlashBackendModel(model: string, thinkingLevel?: string): string | undefined;
/**
 * Resolves Gemini 3.7 Flash to backend model ID with tier suffix.
 * Backend expects gemini-3.7-flash-{low|medium|high} — valid when the
 * request carries the official Antigravity CLI User-Agent (see request.ts).
 */
export declare function resolveAntigravityGemini37FlashBackendModel(model: string, thinkingLevel?: string): string | undefined;
/**
 * Resolves a model name with optional tier suffix and quota prefix to its actual API model name
 * and corresponding thinking configuration.
 *
 * Quota routing:
 * - Default to Antigravity quota unless cli_first is enabled for Gemini models
 * - Fallback to Gemini CLI happens at account rotation level when Antigravity is exhausted
 * - "antigravity-" prefix marks explicit quota (no fallback allowed)
 * - Claude and image models always use Antigravity
 *
 * Examples:
 * - "gemini-2.5-flash" → { quotaPreference: "antigravity" }
 * - "gemini-3-pro-preview" → { quotaPreference: "antigravity" }
 * - "antigravity-gemini-3-pro-high" → { quotaPreference: "antigravity", explicitQuota: true }
 * - "claude-opus-4-6-thinking-medium" → { quotaPreference: "antigravity" }
 *
 * @param requestedModel - The model name from the request
 * @param options - Optional configuration including cli_first preference
 * @returns Resolved model with thinking configuration
 */
export declare function resolveModelWithTier(requestedModel: string, options?: ModelResolverOptions): ResolvedModel;
/**
 * Gets the model family for routing decisions.
 */
export declare function getModelFamily(model: string): "claude" | "gemini-flash" | "gemini-pro";
/**
 * Variant config from OpenCode's providerOptions.
 */
export interface VariantConfig {
    thinkingBudget?: number;
    googleSearch?: GoogleSearchConfig;
}
/**
 * Resolves model name for a specific headerStyle (quota fallback support).
 * Transforms model names when switching between gemini-cli and antigravity quotas.
 *
 * Issue #103: When quota fallback occurs, model names need to be transformed:
 * - gemini-3-flash-preview (gemini-cli) → gemini-3-flash (antigravity)
 * - gemini-3-pro-preview (gemini-cli) → gemini-3-pro-low (antigravity)
 * - gemini-3-flash (antigravity) → gemini-3-flash-preview (gemini-cli)
 */
export declare function resolveModelForHeaderStyle(requestedModel: string, headerStyle: "antigravity" | "gemini-cli"): ResolvedModel;
/**
 * Resolves model with variant config from providerOptions.
 * Variant config takes priority over tier suffix in model name.
 */
export declare function resolveModelWithVariant(requestedModel: string, variantConfig?: VariantConfig): ResolvedModel;
//# sourceMappingURL=model-resolver.d.ts.map