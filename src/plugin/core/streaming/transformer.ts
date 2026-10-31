import type {
  SafetyRating,
  TokenUsage,
  SignatureStore,
  StreamingCallbacks,
  StreamingOptions,
  ThoughtBuffer,
} from './types';
import { processImageData } from '../../image-saver';

export const CLEAN_GUARDRAIL_MESSAGE = "[Solicitud bloqueada por filtros de seguridad de Gemini. Por favor, intenta reformular tu prompt o enfoque.]";
export const CLEAN_CLAUDE_SAFETY_MESSAGE = "[Respuesta bloqueada por el monitor de seguridad de Claude en esta cuenta. safety_level no interviene en modelos Claude: quita o reformula el contenido marcado (suele venir del contexto del proyecto o de AGENTS.md) o usa otro modelo.]";
export const CLEAN_MALFORMED_CALL_MESSAGE = "[Llamada de herramienta vacía o malformada generada por el modelo. Reintentando o reformula tu solicitud.]";
export const LOOP_DETECTED_MALFORMED_MESSAGE = "[Bucle de llamadas malformadas consecutivas detectado. La solicitud ha sido detenida para evitar bucle infinito. Por favor reformula tu prompt.]";

const MAX_CONSECUTIVE_MALFORMED = 3;
const MAX_TRACKED_SESSIONS = 512;
const consecutiveMalformedBySession = new Map<string, number>();

/**
 * Records a malformed-call occurrence for a session and returns the current
 * consecutive streak. Bounds the tracking map so long-lived processes do not
 * accumulate stale session keys.
 */
function bumpMalformedStreak(sessionKey: string): number {
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
export function sanitizeGuardrailText(text: string): string {
  if (
    text.includes("This request was blocked by Gemini's filters") ||
    text.includes("blocked by Gemini's filters") ||
    (text.includes("Gemini's filters") && text.includes("rephrasing your prompt"))
  ) {
    return CLEAN_GUARDRAIL_MESSAGE;
  }
  return text;
}

/**
 * True when the backend model id belongs to the Claude line. Claude responses are
 * filtered by the provider's own monitor on the account, not by Gemini
 * `safetySettings`, so the two cases need different advice.
 */
export function isClaudeModelName(modelName?: string): boolean {
  return typeof modelName === "string" && modelName.toLowerCase().includes("claude");
}

/**
 * Replaces verbose Google safety filter messages in response candidates
 * with a concise rephrasing invitation. Also handles MALFORMED_FUNCTION_CALL
 * finishReason by rewriting to STOP with explanatory content to avoid hard session crash.
 */
export function sanitizeGuardrailMessage(response: unknown, sessionKey?: string, modelName?: string): unknown {
  if (!response || typeof response !== "object") return response;
  const resp = response as Record<string, unknown>;
  const safetyMessage = isClaudeModelName(modelName) ? CLEAN_CLAUDE_SAFETY_MESSAGE : CLEAN_GUARDRAIL_MESSAGE;

  if (Array.isArray(resp.candidates)) {
    for (const candidate of resp.candidates) {
      const cand = candidate as Record<string, unknown> | null;
      if (!cand) continue;

      if (cand.finishReason === "SAFETY") {
        const hasText = (() => {
          if (!cand.content || typeof cand.content !== "object") return false;
          const parts = (cand.content as Record<string, unknown>).parts;
          if (!Array.isArray(parts)) return false;
          return parts.some((part) => {
            const p = part as Record<string, unknown> | null;
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
          } else {
            const content = cand.content as Record<string, unknown>;
            const parts = Array.isArray(content.parts) ? (content.parts as unknown[]) : [];
            const keptParts = parts.filter((part) => {
              const p = part as Record<string, unknown> | null;
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
        } else {
          const content = cand.content as Record<string, unknown>;
          const parts: any[] = Array.isArray(content.parts) ? (content.parts as any[]) : [];
          const isTextPart = (p: any) => p && typeof p === "object" && typeof p.text === "string";
          const hasText = parts.some((p) => isTextPart(p) && p.text.trim().length > 0);
          if (!hasText) {
            // Append the clean message while preserving any non-text parts
            // (e.g. thoughtSignature) so signature continuity is not broken.
            content.parts = [...parts, { text: msg }];
          } else if (msg === LOOP_DETECTED_MALFORMED_MESSAGE) {
            // Drop stale textual content, but keep any non-text metadata such as
            // thoughtSignature so the next turn still has signature continuity.
            const kept: any[] = [];
            for (const p of parts) {
              if (!p || typeof p !== "object") continue;
              if (typeof p.text === "string") {
                const rest = { ...p };
                delete rest.text;
                if (Object.keys(rest).length > 0) kept.push(rest);
              } else {
                kept.push(p);
              }
            }
            content.parts = [...kept, { text: msg }];
          }
        }
      } else if (cand.finishReason === "STOP" && sessionKey) {
        consecutiveMalformedBySession.delete(sessionKey);
      }

      if (cand.content && typeof cand.content === "object") {
        const content = cand.content as Record<string, unknown>;
        if (Array.isArray(content.parts)) {
          for (const part of content.parts) {
            const p = part as Record<string, unknown> | null;
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
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  return (hash >>> 0).toString(16);
}

export function createThoughtBuffer(): ThoughtBuffer {
  const buffer = new Map<number, string>();
  return {
    get: (index: number) => buffer.get(index),
    set: (index: number, text: string) => buffer.set(index, text),
    clear: () => buffer.clear(),
  };
}

export function transformStreamingPayload(
  payload: string,
  transformThinkingParts?: (response: unknown) => unknown,
): string {
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
        const parsed = JSON.parse(json) as { response?: unknown };
        if (parsed.response !== undefined) {
          const transformed = transformThinkingParts
            ? transformThinkingParts(parsed.response)
            : parsed.response;
          return `data: ${JSON.stringify(transformed)}`;
        }
      } catch (_) {}
      return line;
    })
    .join('\n');
}

export function deduplicateThinkingText(
  response: unknown,
  sentBuffer: ThoughtBuffer,
  displayedThinkingHashes?: Set<string>,
): unknown {
  if (!response || typeof response !== 'object') return response;

  const resp = response as Record<string, unknown>;

  if (Array.isArray(resp.candidates)) {
    const newCandidates = resp.candidates.map((candidate: unknown, index: number) => {
      const cand = candidate as Record<string, unknown> | null;
      if (!cand?.content) return candidate;

      const content = cand.content as Record<string, unknown>;
      if (!Array.isArray(content.parts)) return candidate;

      const newParts = content.parts.map((part: unknown) => {
        const p = part as Record<string, unknown>;
        
        // Handle image data - save to disk and return file path
        if (p.inlineData) {
          const inlineData = p.inlineData as Record<string, unknown>;
          const result = processImageData({
            mimeType: inlineData.mimeType as string | undefined,
            data: inlineData.data as string | undefined,
          });
          if (result) {
            return { text: result };
          }
        }
        
        if (p.thought === true || p.type === 'thinking') {
          const fullText = (p.text || p.thinking || '') as string;
          
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
    const newContent = resp.content.map((block: unknown) => {
      const b = block as Record<string, unknown> | null;
      if (b?.type === 'thinking') {
        const fullText = (b.thinking || b.text || '') as string;
        
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

export function transformSseLine(
  line: string,
  signatureStore: SignatureStore,
  thoughtBuffer: ThoughtBuffer,
  sentThinkingBuffer: ThoughtBuffer,
  callbacks: StreamingCallbacks,
  options: StreamingOptions,
  debugState: { injected: boolean },
  usageState?: { value?: TokenUsage },
): string {
  if (!line.startsWith('data:')) {
    return line;
  }
  const json = line.slice(5).trim();
  if (!json) {
    return line;
  }

  try {
    const parsed = JSON.parse(json) as { response?: unknown };
    if (parsed.response !== undefined) {
      const usageMetadata = (parsed.response as Record<string, unknown> | null)?.["usageMetadata"] as
        | TokenUsage
        | undefined;
      if (usageMetadata && usageState) {
        // Cumulative across chunks: keep the newest block and report once.
        usageState.value = usageMetadata;
      }
      if (options.cacheSignatures && options.signatureSessionKey) {
        cacheThinkingSignaturesFromResponse(
          parsed.response,
          options.signatureSessionKey,
          signatureStore,
          thoughtBuffer,
          callbacks.onCacheSignature,
        );
      }

      let response: unknown = deduplicateThinkingText(
        parsed.response,
        sentThinkingBuffer,
        options.displayedThinkingHashes
      );

      if (options.debugText && callbacks.onInjectDebug && !debugState.injected) {
        response = callbacks.onInjectDebug(response, options.debugText);
        debugState.injected = true;
      }

      // Clean guardrail / safety filter message
      response = sanitizeGuardrailMessage(response, options.signatureSessionKey, options.modelName);

      // Extract and notify safety ratings if present
      if (callbacks.onSafetyRatings && parsed.response && typeof parsed.response === "object") {
        const respObj = parsed.response as Record<string, unknown>;
        if (Array.isArray(respObj.candidates)) {
          for (const candidate of respObj.candidates) {
            const cand = candidate as Record<string, unknown> | null;
            if (cand && Array.isArray(cand.safetyRatings) && cand.safetyRatings.length > 0) {
              callbacks.onSafetyRatings(cand.safetyRatings as any);
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
  } catch (_) {}
  return line;
}

export function cacheThinkingSignaturesFromResponse(
  response: unknown,
  signatureSessionKey: string,
  signatureStore: SignatureStore,
  thoughtBuffer: ThoughtBuffer,
  onCacheSignature?: (sessionKey: string, text: string, signature: string) => void,
): void {
  if (!response || typeof response !== 'object') return;

  const resp = response as Record<string, unknown>;

  if (Array.isArray(resp.candidates)) {
    resp.candidates.forEach((candidate: unknown, index: number) => {
      const cand = candidate as Record<string, unknown> | null;
      if (!cand?.content) return;
      const content = cand.content as Record<string, unknown>;
      if (!Array.isArray(content.parts)) return;

      content.parts.forEach((part: unknown) => {
        const p = part as Record<string, unknown>;
        if (p.thought === true || p.type === 'thinking') {
          const text = (p.text || p.thinking || '') as string;
          if (text) {
            const current = thoughtBuffer.get(index) ?? '';
            thoughtBuffer.set(index, current + text);
          }
        }

        if (p.thoughtSignature) {
          const fullText = thoughtBuffer.get(index) ?? '';
          if (fullText) {
            const signature = p.thoughtSignature as string;
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
    resp.content.forEach((block: unknown) => {
      const b = block as Record<string, unknown> | null;
      if (b?.type === 'thinking') {
        const text = (b.thinking || b.text || '') as string;
        if (text) {
          const current = thoughtBuffer.get(CLAUDE_BUFFER_KEY) ?? '';
          thoughtBuffer.set(CLAUDE_BUFFER_KEY, current + text);
        }
      }
      if (b?.signature) {
        const fullText = thoughtBuffer.get(CLAUDE_BUFFER_KEY) ?? '';
        if (fullText) {
          const signature = b.signature as string;
          onCacheSignature?.(signatureSessionKey, fullText, signature);
          signatureStore.set(signatureSessionKey, { text: fullText, signature });
        }
      }
    });
  }
}

export function createStreamingTransformer(
  signatureStore: SignatureStore,
  callbacks: StreamingCallbacks,
  options: StreamingOptions = {},
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  const thoughtBuffer = createThoughtBuffer();
  const sentThinkingBuffer = createThoughtBuffer();
  const debugState = { injected: false };
  const usageState: { value?: TokenUsage } = {};
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

        const transformedLine = transformSseLine(
          line,
          signatureStore,
          thoughtBuffer,
          sentThinkingBuffer,
          callbacks,
          options,
          debugState,
          usageState,
        );
        controller.enqueue(encoder.encode(transformedLine + '\n'));
      }
    },
    flush(controller) {
      buffer += decoder.decode();

      if (buffer) {
        if (buffer.includes('usageMetadata')) {
          hasSeenUsageMetadata = true;
        }
        const transformedLine = transformSseLine(
          buffer,
          signatureStore,
          thoughtBuffer,
          sentThinkingBuffer,
          callbacks,
          options,
          debugState,
          usageState,
        );
        controller.enqueue(encoder.encode(transformedLine));
      }

      if (usageState.value) {
        callbacks.onUsage?.(usageState.value);
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
