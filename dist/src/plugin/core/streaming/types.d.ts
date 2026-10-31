export interface SignedThinking {
    text: string;
    signature: string;
}
export interface SignatureStore {
    get(sessionKey: string): SignedThinking | undefined;
    set(sessionKey: string, value: SignedThinking): void;
    has(sessionKey: string): boolean;
    delete(sessionKey: string): void;
}
export interface SafetyRating {
    category: string;
    probability: "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH" | string;
    blocked?: boolean;
}
export interface TokenUsage {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
}
export interface StreamingCallbacks {
    onCacheSignature?: (sessionKey: string, text: string, signature: string) => void;
    onInjectDebug?: (response: unknown, debugText: string) => unknown;
    onSafetyRatings?: (ratings: SafetyRating[]) => void;
    /** Final token usage for the response, reported once the stream flushes. */
    onUsage?: (usage: TokenUsage) => void;
    transformThinkingParts?: (parts: unknown) => unknown;
}
export interface StreamingOptions {
    signatureSessionKey?: string;
    debugText?: string;
    cacheSignatures?: boolean;
    displayedThinkingHashes?: Set<string>;
    /** Backend model id, used to pick the right safety-block wording (Claude vs Gemini). */
    modelName?: string;
}
export interface ThoughtBuffer {
    get(index: number): string | undefined;
    set(index: number, text: string): void;
    clear(): void;
}
//# sourceMappingURL=types.d.ts.map