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
export interface StreamingCallbacks {
    onCacheSignature?: (sessionKey: string, text: string, signature: string) => void;
    onInjectDebug?: (response: unknown, debugText: string) => unknown;
    onSafetyRatings?: (ratings: SafetyRating[]) => void;
    transformThinkingParts?: (parts: unknown) => unknown;
}
export interface StreamingOptions {
    signatureSessionKey?: string;
    debugText?: string;
    cacheSignatures?: boolean;
    displayedThinkingHashes?: Set<string>;
}
export interface ThoughtBuffer {
    get(index: number): string | undefined;
    set(index: number, text: string): void;
    clear(): void;
}
//# sourceMappingURL=types.d.ts.map