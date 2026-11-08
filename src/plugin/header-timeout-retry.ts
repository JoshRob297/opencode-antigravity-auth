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

const HEADER_TIMEOUT_MARKERS = [
  "timeout awaiting response headers",
  "timeout awaiting headers",
  "http2: timeout",
];

export const DEFAULT_HEADER_TIMEOUT_ATTEMPTS = 3;
export const DEFAULT_HEADER_TIMEOUT_DELAY_MS = 1_000;

export function isHeaderTimeoutError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  const lower = message.toLowerCase();
  return HEADER_TIMEOUT_MARKERS.some((marker) => lower.includes(marker));
}

export interface HeaderTimeoutRetryOptions {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function fetchWithHeaderTimeoutRetry(
  doFetch: () => Promise<Response>,
  options: HeaderTimeoutRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_HEADER_TIMEOUT_ATTEMPTS);
  const baseDelay = Math.max(0, options.delayMs ?? DEFAULT_HEADER_TIMEOUT_DELAY_MS);
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await doFetch();
    } catch (error) {
      lastError = error;
      const exhausted = attempt === attempts;
      if (exhausted || !isHeaderTimeoutError(error)) {
        throw error;
      }
      options.onRetry?.(attempt, error);
      // Back off a little each time: 1s, 2s, 4s...
      await sleep(baseDelay * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
