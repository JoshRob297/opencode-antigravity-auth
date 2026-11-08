/**
 * Retry for the one network timeout that is worth waiting out.
 *
 * When a deep-reasoning model is asked for a long answer, the backend can take
 * more than a minute before it emits the first response header. Node's HTTP/2
 * client gives up on that wait with
 *
 *     http2: timeout awaiting response headers
 *
 * and the request fails even though the model was about to answer. The 1.5.3
 * Antigravity CLI retries in that situation; doing the same here turns a
 * user-visible timeout into a slower answer.
 *
 * Only that failure is retried, and only when nothing was consumed: a thrown
 * `fetch` means no response object exists, so repeating the request cannot
 * replay a partially read body.
 */
export declare const DEFAULT_HEADER_TIMEOUT_ATTEMPTS = 3;
export declare const DEFAULT_HEADER_TIMEOUT_DELAY_MS = 1000;
export declare function isHeaderTimeoutError(error: unknown): boolean;
export interface HeaderTimeoutRetryOptions {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, error: unknown) => void;
}
export declare function fetchWithHeaderTimeoutRetry(doFetch: () => Promise<Response>, options?: HeaderTimeoutRetryOptions): Promise<Response>;
//# sourceMappingURL=header-timeout-retry.d.ts.map