/**
 * Google Search Tool Implementation
 *
 * Due to Gemini API limitations, native search tools (googleSearch, urlContext)
 * cannot be combined with function declarations. This module implements a
 * wrapper that makes separate API calls with only the grounding tools enabled.
 */
import { ANTIGRAVITY_ENDPOINT, getAntigravityHeaders, SEARCH_MODEL, SEARCH_TIMEOUT_MS, SEARCH_SYSTEM_INSTRUCTION, } from "../constants";
import { createLogger } from "./logger";
const log = createLogger("search");
// ============================================================================
// Helper Functions
// ============================================================================
let sessionCounter = 0;
const sessionPrefix = `search-${Date.now().toString(36)}`;
function generateRequestId() {
    return `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function getSessionId() {
    sessionCounter++;
    return `${sessionPrefix}-${sessionCounter}`;
}
function formatSearchResult(result) {
    const lines = [];
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
            const status = url.status === "URL_RETRIEVAL_STATUS_SUCCESS" ? "✓" : "✗";
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
function parseSearchResponse(data) {
    const result = {
        text: "",
        sources: [],
        searchQueries: [],
        urlsRetrieved: [],
    };
    const response = data.response;
    if (!response || !response.candidates || response.candidates.length === 0) {
        if (data.error) {
            result.text = `Error: ${data.error.message ?? "Unknown error"}`;
        }
        else if (response?.error) {
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
            .map((p) => p.text ?? "")
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
export async function executeSearch(args, accessToken, projectId, abortSignal) {
    const { query, urls, thinking = true } = args;
    // Build prompt with optional URLs
    let prompt = query;
    if (urls && urls.length > 0) {
        const urlList = urls.join("\n");
        prompt = `${query}\n\nURLs to analyze:\n${urlList}`;
    }
    // Build tools array - only grounding tools, no function declarations
    const tools = [];
    tools.push({ googleSearch: {} });
    if (urls && urls.length > 0) {
        tools.push({ urlContext: {} });
    }
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
    // Use non-streaming endpoint for search
    const url = `${ANTIGRAVITY_ENDPOINT}/v1internal:generateContent`;
    log.debug("Executing search", {
        query,
        urlCount: urls?.length ?? 0,
        thinking,
    });
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                ...getAntigravityHeaders(),
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(wrappedBody),
            signal: abortSignal ?? AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            const errorText = await response.text();
            log.debug("Search API error", { status: response.status, error: errorText });
            return `## Search Error\n\nFailed to execute search: ${response.status} ${response.statusText}\n\n${errorText}\n\nPlease try again with a different query.`;
        }
        const data = (await response.json());
        log.debug("Search response received", { hasResponse: !!data.response });
        const result = parseSearchResponse(data);
        const formatted = formatSearchResult(result);
        log.debug("Search response formatted", { resultLength: formatted.length });
        return formatted;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.debug("Search execution error", { error: message });
        return `## Search Error\n\nFailed to execute search: ${message}. Please try again with a different query.`;
    }
}
//# sourceMappingURL=search.js.map