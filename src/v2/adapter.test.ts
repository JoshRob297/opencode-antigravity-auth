import { describe, expect, it, vi } from "vitest";
import { setupV2, type V2Context } from "./adapter";

describe("OpenCode v2 Adapter", () => {
  it("initializes and registers tools, commands, models, and session hooks with OpenCode v2 context", async () => {
    const registeredTools: any[] = [];
    const registeredCommands: any[] = [];
    const registeredHooks: Record<string, Function> = {};
    const updatedModels: any[] = [];

    const mockContext: V2Context = {
      location: { directory: process.cwd() },
      session: {
        hook: vi.fn().mockImplementation(async (name, callback) => {
          registeredHooks[name] = callback;
          return { dispose: async () => {} };
        }),
      },
      model: {
        transform: vi.fn().mockImplementation(async (callback) => {
          const editor = {
            update: (providerId: string, modelId: string, updater: Function) => {
              const draft: any = {};
              updater(draft);
              updatedModels.push({ providerId, modelId, ...draft });
            },
          };
          callback(editor);
          return { dispose: async () => {} };
        }),
      },
      tool: {
        transform: vi.fn().mockImplementation(async (callback) => {
          const editor = {
            add: (t: any) => registeredTools.push(t),
          };
          callback(editor);
          return { dispose: async () => {} };
        }),
      },
      command: {
        transform: vi.fn().mockImplementation(async (callback) => {
          const editor = {
            add: (c: any) => registeredCommands.push(c),
          };
          callback(editor);
          return { dispose: async () => {} };
        }),
      },
    };

    const cleanup = await setupV2(mockContext);
    expect(typeof cleanup).toBe("function");

    // Tools verification
    expect(mockContext.tool?.transform).toHaveBeenCalled();
    const quotaTool = registeredTools.find((t) => t.id === "antigravity_quota");
    expect(quotaTool).toBeDefined();
    expect(quotaTool?.description).toContain("Antigravity quota");

    const searchTool = registeredTools.find((t) => t.id === "google_search");
    expect(searchTool).toBeDefined();
    expect(searchTool?.description).toContain("Google Search");

    // Command verification
    expect(mockContext.command?.transform).toHaveBeenCalled();
    const quotaCommand = registeredCommands.find((c) => c.name === "antigravity-quota");
    expect(quotaCommand).toBeDefined();

    // Model transform verification
    expect(mockContext.model?.transform).toHaveBeenCalled();
    const gemini38 = updatedModels.find((m) => m.modelId === "antigravity-gemini-3.8-flash");
    expect(gemini38).toBeDefined();
    expect(gemini38?.name).toContain("Gemini 3.8 Flash");

    // Session hooks verification
    expect(mockContext.session?.hook).toHaveBeenCalledWith("http.request", expect.any(Function));
    expect(mockContext.session?.hook).toHaveBeenCalledWith("http.response", expect.any(Function));
    expect(mockContext.session?.hook).toHaveBeenCalledWith("retry", expect.any(Function));

    // Test retry hook ignores non-429 errors
    const retryEvent: any = { error: { status: 500 } };
    await registeredHooks["retry"](retryEvent);
    expect(retryEvent.decision).toBeUndefined();

    // Verify cleanup execution
    if (typeof cleanup === "function") {
      expect(() => cleanup()).not.toThrow();
    }
  });

  it("handles empty or partial v2 context gracefully", async () => {
    const emptyContext: V2Context = {};
    const cleanup = await setupV2(emptyContext);
    expect(typeof cleanup).toBe("function");
  });
});
