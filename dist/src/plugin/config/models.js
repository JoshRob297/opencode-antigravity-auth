const DEFAULT_MODALITIES = {
    input: ["text", "image", "pdf"],
    output: ["text"],
};
export const OPENCODE_MODEL_DEFINITIONS = {
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
    "antigravity-gemini-3.7-flash": {
        name: "Gemini 3.7 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.6-flash": {
        name: "Gemini 3.6 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.5-flash": {
        name: "Gemini 3.5 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            minimal: { thinkingLevel: "minimal" },
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.1-pro": {
        name: "Gemini 3.1 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-claude-sonnet-4-6": {
        name: "Claude Sonnet 4.6 (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
    },
    "antigravity-claude-opus-4-6-thinking": {
        name: "Claude Opus 4.6 Thinking (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingConfig: { thinkingBudget: 8192 } },
            max: { thinkingConfig: { thinkingBudget: 32768 } },
        },
    },
};
//# sourceMappingURL=models.js.map