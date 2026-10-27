import { describe, expect, it } from "vitest";
import {
  pruneHistoricalToolResponses,
  pruneHistoricalClaudeToolResponses,
  MAX_HISTORICAL_TOOL_RESPONSE_CHARS,
} from "./request";

describe("pruneHistoricalToolResponses (Gemini)", () => {
  it("does not touch payloads with 2 or fewer turns", () => {
    const contents = [
      { role: "user", parts: [{ text: "first turn" }] },
      { role: "model", parts: [{ functionCall: { name: "bash" } }] },
    ];
    const result = pruneHistoricalToolResponses(contents, 100);
    expect(result).toBe(contents);
  });

  it("leaves the last 2 turns intact regardless of response size", () => {
    const hugeOutput = "A".repeat(50_000);
    const contents = [
      { role: "user", parts: [{ text: "hello" }] },
      { role: "model", parts: [{ functionCall: { name: "bash" } }] },
      {
        role: "user",
        parts: [{ functionResponse: { name: "bash", response: { output: hugeOutput } } }],
      },
      { role: "model", parts: [{ text: "current response" }] },
    ];

    // Last 2 turns are index 2 and index 3; index 2 is penultimate (contents.length - 2)
    const result: any = pruneHistoricalToolResponses(contents, 10_000);
    expect(result[2].parts[0].functionResponse.response.output).toBe(hugeOutput);
  });

  it("truncates oversized functionResponse in historical turns (index < length - 2)", () => {
    const hugeOutput = "B".repeat(60_000);
    const contents = [
      {
        role: "user",
        parts: [{ functionResponse: { name: "bash", response: { output: hugeOutput } } }],
      },
      { role: "model", parts: [{ text: "middle response" }] },
      { role: "user", parts: [{ text: "penultimate" }] },
      { role: "model", parts: [{ text: "latest" }] },
    ];

    const result: any = pruneHistoricalToolResponses(contents, 20_000);
    const truncatedOutput = result[0].parts[0].functionResponse.response.output;
    expect(truncatedOutput.length).toBeLessThan(3_000);
    expect(truncatedOutput).toContain("output truncado preventivamente");
    expect(truncatedOutput).toContain("60000 caracteres");
  });
});

describe("pruneHistoricalClaudeToolResponses (Claude)", () => {
  it("truncates oversized tool_result in historical messages", () => {
    const hugeContent = "C".repeat(50_000);
    const messages = [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "call_1", content: hugeContent }],
      },
      { role: "assistant", content: [{ type: "text", text: "step 1" }] },
      { role: "user", content: [{ type: "text", text: "latest turn" }] },
    ];

    const result: any = pruneHistoricalClaudeToolResponses(messages, 20_000);
    const truncatedText = result[0].content[0].content;
    expect(truncatedText.length).toBeLessThan(3_000);
    expect(truncatedText).toContain("output truncado preventivamente");
    expect(truncatedText).toContain("50000 caracteres");
  });
});
