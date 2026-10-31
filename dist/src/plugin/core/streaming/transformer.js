import { processImageData } from '../../image-saver';
export const CLEAN_GUARDRAIL_MESSAGE = "[Solicitud bloqueada por filtros de seguridad de Gemini. Por favor, intenta reformular tu prompt o enfoque.]";
export const CLEAN_CLAUDE_SAFETY_MESSAGE = "[Respuesta bloqueada por el monitor de seguridad de Claude en esta cuenta. safety_level no interviene en modelos Claude: quita o reformula el contenido marcado (suele venir del contexto del proyecto o de AGENTS.md) o usa otro modelo.]";
export const CLEAN_MALFORMED_CALL_MESSAGE = "[Llamada de herramienta vacía o malformada generada por el modelo. Reintentando o reformula tu solicitud.]";
export const LOOP_DETECTED_MALFORMED_MESSAGE = "[Bucle de llamadas malformadas consecutivas detectado. La solicitud ha sido detenida para evitar bucle infinito. Por favor reformula tu prompt.]";
const MAX_CONSECUTIVE_MALFORMED = 3;
const MAX_TRACKED_SESSIONS = 512;
const consecutiveMalformedBySession = new Map();
/**
 * Records a malformed-call occurrence for a session and returns the current
 * consecutive streak. Bounds the tracking map so long-lived processes do not
 * accumulate stale session keys.
 */
function bumpMalformedStreak(sessionKey) {
    const streak = (consecutiveMalformedBySession.get(sessionKey) ?? 0) + 1;
    consecutiveMalformedBySession.set(sessionKey, streak);
    if (consecutiveMalformedBySession.size > MAX_TRACKED_SESSIONS) {
        const oldest = consecutiveMalformedBySession.keys().next().value;
        if (oldest !== undefined) {
            consecutiveMalformedBySession.delete(oldest);
        }
    }
    return streak;
}
/**
 * Checks if a text is the generic verbose Gemini filter blocking message
 * and replaces it with a clean, concise prompt rephrase invitation.
 */
export function sanitizeGuardrailText(text) {
    if (text.includes("This request was blocked by Gemini's filters") ||
        text.includes("blocked by Gemini's filters") ||
        (text.includes("Gemini's filters") && text.includes("rephrasing your prompt"))) {
        return CLEAN_GUARDRAIL_MESSAGE;
    }
    return text;
}
/**
 * True when the backend model id belongs to the Claude line. Claude responses are
 * filtered by the provider's own monitor on the account, not by Gemini
 * `safetySettings`, so the two cases need different advice.
 */
export function isClaudeModelName(modelName) {
    return typeof modelName === "string" && modelName.toLowerCase().includes("claude");
}
/**
 * Replaces verbose Google safety filter messages in response candidates
 * with a concise rephrasing invitation. Also handles MALFORMED_FUNCTION_CALL
 * finishReason by rewriting to STOP with explanatory content to avoid hard session crash.
 */
export function sanitizeGuardrailMessage(response, sessionKey, modelName) {
    if (!response || typeof response !== "object")
        return response;
    const resp = response;
    const safetyMessage = isClaudeModelName(modelName) ? CLEAN_CLAUDE_SAFETY_MESSAGE : CLEAN_GUARDRAIL_MESSAGE;
    if (Array.isArray(resp.candidates)) {
        for (const candidate of resp.candidates) {
            const cand = candidate;
            if (!cand)
                continue;
            if (cand.finishReason === "SAFETY") {
                const hasText = (() => {
                    if (!cand.content || typeof cand.content !== "object")
                        return false;
                    const parts = cand.content.parts;
                    if (!Array.isArray(parts))
                        return false;
                    return parts.some((part) => {
                        const p = part;
                        return Boolean(p && typeof p.text === "string" && p.text.trim().length > 0);
                    });
                })();
                // Measured 2026-10-31 on a Claude 5.5 account: the safety monitor behind
                // the model answers `finishReason: SAFETY` with an *empty* text part, so
                // the UI showed a bare "Provider blocked the response". Replace the empty
                // payload with an actionable message, keeping any non-text parts
                // (thoughtSignature) intact so signature continuity survives. The wording
                // depends on the family: Claude is blocked by the provider's monitor, not
                // by the Gemini `safetySettings` the plugin controls.
                if (!hasText) {
                    if (!cand.content || typeof cand.content !== "object") {
                        cand.content = { parts: [{ text: safetyMessage }], role: "model" };
                    }
                    else {
                        const content = cand.content;
                        const parts = Array.isArray(content.parts) ? content.parts : [];
                        const keptParts = parts.filter((part) => {
                            const p = part;
                            return Boolean(p && typeof p === "object" && typeof p.text !== "string");
                        });
                        content.parts = [...keptParts, { text: safetyMessage }];
                    }
                }
            }
            if (cand.finishReason === "MALFORMED_FUNCTION_CALL") {
                let msg = CLEAN_MALFORMED_CALL_MESSAGE;
                if (sessionKey) {
                    const streak = bumpMalformedStreak(sessionKey);
                    if (streak >= MAX_CONSECUTIVE_MALFORMED) {
                        msg = LOOP_DETECTED_MALFORMED_MESSAGE;
                    }
                }
                cand.finishReason = "STOP";
                if (cand.finishMessage) {
                    delete cand.finishMessage;
                }
                if (!cand.content || typeof cand.content !== "object") {
                    cand.content = { parts: [{ text: msg }], role: "model" };
                }
                else {
                    const content = cand.content;
                    const parts = Array.isArray(content.parts) ? content.parts : [];
                    const isTextPart = (p) => p && typeof p === "object" && typeof p.text === "string";
                    const hasText = parts.some((p) => isTextPart(p) && p.text.trim().length > 0);
                    if (!hasText) {
                        // Append the clean message while preserving any non-text parts
                        // (e.g. thoughtSignature) so signature continuity is not broken.
                        content.parts = [...parts, { text: msg }];
                    }
                    else if (msg === LOOP_DETECTED_MALFORMED_MESSAGE) {
                        // Drop stale textual content, but keep any non-text metadata such as
                        // thoughtSignature so the next turn still has signature continuity.
                        const kept = [];
                        for (const p of parts) {
                            if (!p || typeof p !== "object")
                                continue;
                            if (typeof p.text === "string") {
                                const rest = { ...p };
                                delete rest.text;
                                if (Object.keys(rest).length > 0)
                                    kept.push(rest);
                            }
                            else {
                                kept.push(p);
                            }
                        }
                        content.parts = [...kept, { text: msg }];
                    }
                }
            }
            else if (cand.finishReason === "STOP" && sessionKey) {
                consecutiveMalformedBySession.delete(sessionKey);
            }
            if (cand.content && typeof cand.content === "object") {
                const content = cand.content;
                if (Array.isArray(content.parts)) {
                    for (const part of content.parts) {
                        const p = part;
                        if (p && typeof p.text === "string") {
                            p.text = sanitizeGuardrailText(p.text);
                        }
                    }
                }
            }
        }
    }
    return response;
}
/**
 * Simple string hash for thinking deduplication.
 * Uses DJB2-like algorithm.
 */
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
    }
    return (hash >>> 0).toString(16);
}
export function createThoughtBuffer() {
    const buffer = new Map();
    return {
        get: (index) => buffer.get(index),
        set: (index, text) => buffer.set(index, text),
        clear: () => buffer.clear(),
    };
}
export function transformStreamingPayload(payload, transformThinkingParts) {
    return payload
        .split('\n')
        .map((line) => {
        if (!line.startsWith('data:')) {
            return line;
        }
        const json = line.slice(5).trim();
        if (!json) {
            return line;
        }
        try {
            const parsed = JSON.parse(json);
            if (parsed.response !== undefined) {
                const transformed = transformThinkingParts
                    ? transformThinkingParts(parsed.response)
                    : parsed.response;
                return `data: ${JSON.stringify(transformed)}`;
            }
        }
        catch (_) { }
        return line;
    })
        .join('\n');
}
export function deduplicateThinkingText(response, sentBuffer, displayedThinkingHashes) {
    if (!response || typeof response !== 'object')
        return response;
    const resp = response;
    if (Array.isArray(resp.candidates)) {
        const newCandidates = resp.candidates.map((candidate, index) => {
            const cand = candidate;
            if (!cand?.content)
                return candidate;
            const content = cand.content;
            if (!Array.isArray(content.parts))
                return candidate;
            const newParts = content.parts.map((part) => {
                const p = part;
                // Handle image data - save to disk and return file path
                if (p.inlineData) {
                    const inlineData = p.inlineData;
                    const result = processImageData({
                        mimeType: inlineData.mimeType,
                        data: inlineData.data,
                    });
                    if (result) {
                        return { text: result };
                    }
                }
                if (p.thought === true || p.type === 'thinking') {
                    const fullText = (p.text || p.thinking || '');
                    if (displayedThinkingHashes) {
                        const hash = hashString(fullText);
                        if (displayedThinkingHashes.has(hash)) {
                            sentBuffer.set(index, fullText);
                            return null;
                        }
                        displayedThinkingHashes.add(hash);
                    }
                    const sentText = sentBuffer.get(index) ?? '';
                    if (fullText.startsWith(sentText)) {
                        const delta = fullText.slice(sentText.length);
                        sentBuffer.set(index, fullText);
                        if (delta) {
                            return { ...p, text: delta, thinking: delta };
                        }
                        return null;
                    }
                    sentBuffer.set(index, fullText);
                    return part;
                }
                return part;
            });
            const filteredParts = newParts.filter((p) => p !== null);
            return {
                ...cand,
                content: { ...content, parts: filteredParts },
            };
        });
        return { ...resp, candidates: newCandidates };
    }
    if (Array.isArray(resp.content)) {
        let thinkingIndex = 0;
        const newContent = resp.content.map((block) => {
            const b = block;
            if (b?.type === 'thinking') {
                const fullText = (b.thinking || b.text || '');
                if (displayedThinkingHashes) {
                    const hash = hashString(fullText);
                    if (displayedThinkingHashes.has(hash)) {
                        sentBuffer.set(thinkingIndex, fullText);
                        thinkingIndex++;
                        return null;
                    }
                    displayedThinkingHashes.add(hash);
                }
                const sentText = sentBuffer.get(thinkingIndex) ?? '';
                if (fullText.startsWith(sentText)) {
                    const delta = fullText.slice(sentText.length);
                    sentBuffer.set(thinkingIndex, fullText);
                    thinkingIndex++;
                    if (delta) {
                        return { ...b, thinking: delta, text: delta };
                    }
                    return null;
                }
                sentBuffer.set(thinkingIndex, fullText);
                thinkingIndex++;
                return block;
            }
            return block;
        });
        const filteredContent = newContent.filter((b) => b !== null);
        return { ...resp, content: filteredContent };
    }
    return response;
}
export function transformSseLine(line, signatureStore, thoughtBuffer, sentThinkingBuffer, callbacks, options, debugState) {
    if (!line.startsWith('data:')) {
        return line;
    }
    const json = line.slice(5).trim();
    if (!json) {
        return line;
    }
    try {
        const parsed = JSON.parse(json);
        if (parsed.response !== undefined) {
            if (options.cacheSignatures && options.signatureSessionKey) {
                cacheThinkingSignaturesFromResponse(parsed.response, options.signatureSessionKey, signatureStore, thoughtBuffer, callbacks.onCacheSignature);
            }
            let response = deduplicateThinkingText(parsed.response, sentThinkingBuffer, options.displayedThinkingHashes);
            if (options.debugText && callbacks.onInjectDebug && !debugState.injected) {
                response = callbacks.onInjectDebug(response, options.debugText);
                debugState.injected = true;
            }
            // Clean guardrail / safety filter message
            response = sanitizeGuardrailMessage(response, options.signatureSessionKey, options.modelName);
            // Extract and notify safety ratings if present
            if (callbacks.onSafetyRatings && parsed.response && typeof parsed.response === "object") {
                const respObj = parsed.response;
                if (Array.isArray(respObj.candidates)) {
                    for (const candidate of respObj.candidates) {
                        const cand = candidate;
                        if (cand && Array.isArray(cand.safetyRatings) && cand.safetyRatings.length > 0) {
                            callbacks.onSafetyRatings(cand.safetyRatings);
                            break;
                        }
                    }
                }
            }
            const transformed = callbacks.transformThinkingParts
                ? callbacks.transformThinkingParts(response)
                : response;
            return `data: ${JSON.stringify(transformed)}`;
        }
    }
    catch (_) { }
    return line;
}
export function cacheThinkingSignaturesFromResponse(response, signatureSessionKey, signatureStore, thoughtBuffer, onCacheSignature) {
    if (!response || typeof response !== 'object')
        return;
    const resp = response;
    if (Array.isArray(resp.candidates)) {
        resp.candidates.forEach((candidate, index) => {
            const cand = candidate;
            if (!cand?.content)
                return;
            const content = cand.content;
            if (!Array.isArray(content.parts))
                return;
            content.parts.forEach((part) => {
                const p = part;
                if (p.thought === true || p.type === 'thinking') {
                    const text = (p.text || p.thinking || '');
                    if (text) {
                        const current = thoughtBuffer.get(index) ?? '';
                        thoughtBuffer.set(index, current + text);
                    }
                }
                if (p.thoughtSignature) {
                    const fullText = thoughtBuffer.get(index) ?? '';
                    if (fullText) {
                        const signature = p.thoughtSignature;
                        onCacheSignature?.(signatureSessionKey, fullText, signature);
                        signatureStore.set(signatureSessionKey, { text: fullText, signature });
                    }
                }
            });
        });
    }
    if (Array.isArray(resp.content)) {
        // Use thoughtBuffer to accumulate thinking text across SSE events
        // Claude streams thinking content and signature in separate events
        const CLAUDE_BUFFER_KEY = 0; // Use index 0 for Claude's single-stream content
        resp.content.forEach((block) => {
            const b = block;
            if (b?.type === 'thinking') {
                const text = (b.thinking || b.text || '');
                if (text) {
                    const current = thoughtBuffer.get(CLAUDE_BUFFER_KEY) ?? '';
                    thoughtBuffer.set(CLAUDE_BUFFER_KEY, current + text);
                }
            }
            if (b?.signature) {
                const fullText = thoughtBuffer.get(CLAUDE_BUFFER_KEY) ?? '';
                if (fullText) {
                    const signature = b.signature;
                    onCacheSignature?.(signatureSessionKey, fullText, signature);
                    signatureStore.set(signatureSessionKey, { text: fullText, signature });
                }
            }
        });
    }
}
export function createStreamingTransformer(signatureStore, callbacks, options = {}) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    const thoughtBuffer = createThoughtBuffer();
    const sentThinkingBuffer = createThoughtBuffer();
    const debugState = { injected: false };
    let hasSeenUsageMetadata = false;
    return new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                // Quick check for usage metadata presence in the raw line
                if (line.includes('usageMetadata')) {
                    hasSeenUsageMetadata = true;
                }
                const transformedLine = transformSseLine(line, signatureStore, thoughtBuffer, sentThinkingBuffer, callbacks, options, debugState);
                controller.enqueue(encoder.encode(transformedLine + '\n'));
            }
        },
        flush(controller) {
            buffer += decoder.decode();
            if (buffer) {
                if (buffer.includes('usageMetadata')) {
                    hasSeenUsageMetadata = true;
                }
                const transformedLine = transformSseLine(buffer, signatureStore, thoughtBuffer, sentThinkingBuffer, callbacks, options, debugState);
                controller.enqueue(encoder.encode(transformedLine));
            }
            // Inject synthetic usage metadata if missing (fixes "Context % used: 0%" issue)
            if (!hasSeenUsageMetadata) {
                const syntheticUsage = {
                    response: {
                        usageMetadata: {
                            promptTokenCount: 0,
                            candidatesTokenCount: 0,
                            totalTokenCount: 0,
                        }
                    }
                };
                controller.enqueue(encoder.encode(`\ndata: ${JSON.stringify(syntheticUsage)}\n\n`));
            }
        },
    });
}
//# sourceMappingURL=transformer.js.map