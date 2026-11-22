/**
 * Google Search Tool Implementation
 *
 * Due to Gemini API limitations, native search tools (googleSearch, urlContext)
 * cannot be combined with function declarations. This module implements a
 * wrapper that makes separate API calls with only the grounding tools enabled.
 */

import {
  ANTIGRAVITY_ENDPOINT_FALLBACKS,
  getAntigravityCliUserAgent,
  getAntigravityHeaders,
  SEARCH_MODEL,
  SEARCH_TIMEOUT_MS,
  SEARCH_SYSTEM_INSTRUCTION,
  SEARCH_THINKING_BUDGET_DEEP,
  SEARCH_THINKING_BUDGET_FAST,
} from "../constants";
import { createLogger } from "./logger";

const log = createLogger("search");

// ============================================================================
// Types
// ============================================================================

interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GroundingSupport {
  segment?: {
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
  groundingChunkIndices?: number[];
}

interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
}

interface UrlMetadata {
  retrieved_url?: string;
  url_retrieval_status?: string;
}

interface UrlContextMetadata {
  url_metadata?: UrlMetadata[];
}

interface SearchResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
    finishReason?: string;
    groundingMetadata?: GroundingMetadata;
    urlContextMetadata?: UrlContextMetadata;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface AntigravitySearchResponse {
  response?: SearchResponse;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface SearchArgs {
  query: string;
  urls?: string[];
  thinking?: boolean;
}

export interface SearchResult {
  text: string;
  sources: Array<{ title: string; url: string }>;
  searchQueries: string[];
  urlsRetrieved: Array<{ url: string; status: string }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

let sessionCounter = 0;
const sessionPrefix = `search-${Date.now().toString(36)}`;

function generateRequestId(): string {
  return `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionId(): string {
  sessionCounter++;
  return `${sessionPrefix}-${sessionCounter}`;
}

function formatSearchResult(result: SearchResult): string {
  const lines: string[] = [];

  lines.push("## Search Results\n");
  lines.push(result.text);
  lines.push("");

  if (result.sources.length > 0) {
    lines.push("### Sources");
    for (const source of result.sources) {
      lines.push(`- [${source.title}](${source.url})`);
    }
    lines.push("");
  }

  if (result.urlsRetrieved.length > 0) {
    lines.push("### URLs Retrieved");
    for (const url of result.urlsRetrieved) {
      const status = url.status === "URL_RETRIEVAL_STATUS_SUCCESS" ? "[OK]" : "[FAIL]";
      lines.push(`- ${status} ${url.url}`);
    }
    lines.push("");
  }

  if (result.searchQueries.length > 0) {
    lines.push("### Search Queries Used");
    for (const q of result.searchQueries) {
      lines.push(`- "${q}"`);
    }
  }

  return lines.join("\n");
}

function parseSearchResponse(data: AntigravitySearchResponse): SearchResult {
  const result: SearchResult = {
    text: "",
    sources: [],
    searchQueries: [],
    urlsRetrieved: [],
  };

  const response = data.response;
  if (!response || !response.candidates || response.candidates.length === 0) {
    if (data.error) {
      result.text = `Error: ${data.error.message ?? "Unknown error"}`;
    } else if (response?.error) {
      result.text = `Error: ${response.error.message ?? "Unknown error"}`;
    }
    return result;
  }

  const candidate = response.candidates[0];
  if (!candidate) {
    return result;
  }

  // Extract text content
  if (candidate.content?.parts) {
    result.text = candidate.content.parts
      .map((p: { text?: string }) => p.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  // Extract grounding metadata
  if (candidate.groundingMetadata) {
    const groundingMeta = candidate.groundingMetadata;

    if (groundingMeta.webSearchQueries) {
      result.searchQueries = groundingMeta.webSearchQueries;
    }

    if (groundingMeta.groundingChunks) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          result.sources.push({
            title: chunk.web.title,
            url: chunk.web.uri,
          });
        }
      }
    }
  }

  // Extract URL context metadata
  if (candidate.urlContextMetadata?.url_metadata) {
    for (const meta of candidate.urlContextMetadata.url_metadata) {
      if (meta.retrieved_url) {
        result.urlsRetrieved.push({
          url: meta.retrieved_url,
          status: meta.url_retrieval_status ?? "UNKNOWN",
        });
      }
    }
  }

  return result;
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Execute a Google Search using the Gemini grounding API.
 *
 * This makes a SEPARATE API call with only googleSearch/urlContext tools,
 * which is required because these tools cannot be combined with function declarations.
 */
export interface SearchAttemptResult {
  ok: boolean;
  formatted: string;
  status?: number;
  retryableAccount?: boolean;
}

export interface SearchCredentials {
  accessToken: string;
  projectId: string;
}

async function executeSearchAttempt(
  args: SearchArgs,
  accessToken: string,
  projectId: string,
  abortSignal?: AbortSignal,
): Promise<SearchAttemptResult> {
  const { query, urls, thinking = true } = args;

  // Build prompt with optional URLs
  let prompt = query;
  if (urls && urls.length > 0) {
    const urlList = urls.join("\n");
    prompt = `${query}\n\nURLs to analyze:\n${urlList}`;
  }

  // Build tools array - only grounding tools, no function declarations
  const tools: Array<Record<string, unknown>> = [];
  tools.push({ googleSearch: {} });
  if (urls && urls.length > 0) {
    tools.push({ urlContext: {} });
  }

  const thinkingBudget = thinking ? SEARCH_THINKING_BUDGET_DEEP : SEARCH_THINKING_BUDGET_FAST;

  const requestPayload = {
    systemInstruction: {
      parts: [{ text: SEARCH_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    tools,
    generationConfig: {
      temperature: 0,
      topP: 1,
      thinkingConfig: {
        thinkingBudget,
      },
    },
  };

  // Wrap in Antigravity format
  const wrappedBody = {
    project: projectId,
    model: SEARCH_MODEL,
    userAgent: "antigravity",
    requestId: generateRequestId(),
    request: {
      ...requestPayload,
      sessionId: getSessionId(),
    },
  };

  const headers = {
    ...getAntigravityHeaders(),
    "User-Agent": getAntigravityCliUserAgent(),
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  log.debug("Executing search", {
    query,
    urlCount: urls?.length ?? 0,
    thinking,
  });

  let lastErrorText = "";
  let lastStatus: number | undefined;

  for (let i = 0; i < ANTIGRAVITY_ENDPOINT_FALLBACKS.length; i++) {
    const endpoint = ANTIGRAVITY_ENDPOINT_FALLBACKS[i];
    const url = `${endpoint}/v1internal:generateContent`;
    const isLastEndpoint = i === ANTIGRAVITY_ENDPOINT_FALLBACKS.length - 1;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(wrappedBody),
        signal: abortSignal ?? AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastStatus = response.status;
        lastErrorText = `Failed to execute search: ${response.status} ${response.statusText}\n\n${errorText}`;
        log.debug("Search API error", { endpoint, status: response.status, error: errorText });

        const isRetryableEndpoint =
          response.status === 403 || response.status === 404 || response.status >= 500;
        if (isRetryableEndpoint && !isLastEndpoint) {
          continue;
        }

        const retryableAccount =
          response.status === 429 || response.status === 401 || response.status === 403;
        return {
          ok: false,
          status: response.status,
          retryableAccount,
          formatted: `## Search Error\n\n${lastErrorText}\n\nPlease try again with a different query.`,
        };
      }

      const data = (await response.json()) as AntigravitySearchResponse;
      log.debug("Search response received", { endpoint, hasResponse: !!data.response });

      const result = parseSearchResponse(data);
      const formatted = formatSearchResult(result);
      log.debug("Search response formatted", { resultLength: formatted.length });
      return { ok: true, formatted };
    } catch (error) {
      if (abortSignal?.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          retryableAccount: false,
          formatted: `## Search Error\n\nFailed to execute search: ${message}. Please try again with a different query.`,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      lastErrorText = `Failed to execute search: ${message}.`;
      log.debug("Search execution error", { endpoint, error: message });
      if (!isLastEndpoint) {
        continue;
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    retryableAccount: false,
    formatted: `## Search Error\n\n${lastErrorText} Please try again with a different query.`,
  };
}

export async function executeSearch(
  args: SearchArgs,
  accessToken: string,
  projectId: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const result = await executeSearchAttempt(args, accessToken, projectId, abortSignal);
  return result.formatted;
}

export async function executeSearchWithRotation<T>(
  args: SearchArgs,
  accounts: readonly T[],
  resolveCredentials: (account: T) => Promise<SearchCredentials | null>,
  options?: {
    abortSignal?: AbortSignal;
    onAccountRateLimit?: (account: T, status?: number) => void;
    onAccountSuccess?: (account: T) => void;
  },
): Promise<string> {
  let lastErrorFormatted: string | null = null;

  for (const account of accounts) {
    if (options?.abortSignal?.aborted) {
      break;
    }

    const creds = await resolveCredentials(account);
    if (!creds?.accessToken) {
      continue;
    }

    const attempt = await executeSearchAttempt(
      args,
      creds.accessToken,
      creds.projectId,
      options?.abortSignal,
    );

    if (attempt.ok) {
      options?.onAccountSuccess?.(account);
      return attempt.formatted;
    }

    lastErrorFormatted = attempt.formatted;
    if (!attempt.retryableAccount) {
      return attempt.formatted;
    }
    options?.onAccountRateLimit?.(account, attempt.status);
  }

  return (
    lastErrorFormatted ??
    "## Search Error\n\nNo valid Antigravity credentials available for search."
  );
}
