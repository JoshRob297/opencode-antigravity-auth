import type { ProviderModel } from "../types";

export type ModelThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * Distinct thinkingBudget sentinel used to represent the `xhigh` tier in OpenCode
 * variants (since OpenCode's `ModelThinkingLevel` cannot express `xhigh`).
 * Kept distinct from `high` (24576) and Claude `max` (32768) so the request
 * resolver maps it unambiguously back to the `-xhigh` backend suffix.
 */
export const GEMINI_XHIGH_THINKING_BUDGET = 28672;

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

const DEFAULT_MODALITIES: ModelModalities = {
  input: ["text", "image", "pdf"],
  output: ["text"],
};

export const OPENCODE_MODEL_DEFINITIONS: OpencodeModelDefinitions = {
  "antigravity-gemini-3.8-flash": {
    name: "Gemini 3.8 Flash (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    modalities: DEFAULT_MODALITIES,
    variants: {
      low: { thinkingLevel: "low" },
      medium: { thinkingLevel: "medium" },
      high: { thinkingLevel: "high" },
    },
  },
  "antigravity-claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6 (Antigravity)",
    limit: { context: 200000, output: 64000 },
    modalities: DEFAULT_MODALITIES,
    // No variants on purpose. Sonnet 4.6 is non-thinking for this backend: only ids
    // carrying "thinking" get a budget (isClaudeThinkingModel), and the request path
    // discards any client-sent thinkingConfig for this model. Advertising tiers here
    // put four inert entries in the picker, so they were removed instead of being
    // silently ignored. Adding them back needs a backend id that actually thinks.
  },
  "antigravity-claude-opus-4-6-thinking": {
    name: "Claude Opus 4.6 Thinking (Antigravity)",
    limit: { context: 200000, output: 64000 },
    modalities: DEFAULT_MODALITIES,
    variants: {
      low: { thinkingConfig: { thinkingBudget: 8192 } },
      medium: { thinkingConfig: { thinkingBudget: 16384 } },
      high: { thinkingConfig: { thinkingBudget: 24576 } },
      max: { thinkingConfig: { thinkingBudget: 32768 } },
    },
  },
  "antigravity-gpt-oss-120b-medium": {
    name: "GPT-OSS 120B (Antigravity)",
    limit: { context: 131072, output: 8192 },
    modalities: DEFAULT_MODALITIES,
  },
};

/**
 * List of Antigravity model IDs to whitelist in OpenCode configuration.
 * Prevents OpenCode from showing 18+ unauthenticated built-in Google models.
 */
export const OPENCODE_WHITELIST_MODELS: string[] = Object.keys(OPENCODE_MODEL_DEFINITIONS);

