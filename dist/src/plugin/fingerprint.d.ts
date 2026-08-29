/**
 * Device Fingerprint Generator for Rate Limit Mitigation
 *
 * Ported from antigravity-claude-proxy PR #170
 * https://github.com/badrisnarayanan/antigravity-claude-proxy/pull/170
 *
 * Generates randomized device fingerprints to help distribute API usage
 * across different apparent device identities.
 */
export interface ClientMetadata {
    ideType: string;
    platform: string;
    pluginType: string;
}
export interface Fingerprint {
    deviceId: string;
    sessionToken: string;
    userAgent: string;
    apiClient: string;
    clientMetadata: ClientMetadata;
    createdAt: number;
    /** @deprecated Kept for backward compat with stored fingerprints */
    quotaUser?: string;
}
/**
 * Fingerprint version for history tracking.
 * Stores a snapshot of a fingerprint with metadata about when/why it was saved.
 */
export interface FingerprintVersion {
    fingerprint: Fingerprint;
    timestamp: number;
    reason: 'initial' | 'regenerated' | 'restored';
}
/** Maximum number of fingerprint versions to keep per account */
export declare const MAX_FINGERPRINT_HISTORY = 5;
export interface FingerprintHeaders {
    "User-Agent": string;
}
/**
 * Generate a randomized device fingerprint.
 * Each fingerprint represents a unique "device" identity.
 */
export declare function generateFingerprint(): Fingerprint;
/**
 * Collect fingerprint based on actual current system.
 * Uses real OS info instead of randomized values.
 */
export declare function collectCurrentFingerprint(): Fingerprint;
/**
 * Update the version in a fingerprint's userAgent to match the current runtime version.
 * Called after version fetcher resolves so saved fingerprints always carry the latest version.
 * Returns true if the userAgent was changed.
 */
export declare function updateFingerprintVersion(fingerprint: Fingerprint): boolean;
/**
 * Build HTTP headers from a fingerprint object.
 * These headers are used to identify the "device" making API requests.
 */
export declare function buildFingerprintHeaders(fingerprint: Fingerprint | null): Partial<FingerprintHeaders>;
/**
 * Get or create the session fingerprint.
 * Returns the same fingerprint for all calls within a session.
 */
export declare function getSessionFingerprint(): Fingerprint;
/**
 * Regenerate the session fingerprint.
 * Call this to get a fresh identity (e.g., after rate limiting).
 */
export declare function regenerateSessionFingerprint(): Fingerprint;
//# sourceMappingURL=fingerprint.d.ts.map