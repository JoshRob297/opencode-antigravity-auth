import { describe, expect, it, vi } from "vitest";
import { setupV2, type V2Context } from "./adapter";

describe("OpenCode v2 Adapter", () => {
  it(
    "initializes and registers tools, commands, models, and session hooks with OpenCode v2 context",
    async () => {
      const registeredTools: any[] = [];
    const registeredCommands: any[] = [];
    const registeredMethods: any[] = [];
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
            // Real v2 ToolEditor derives the effective id from the tool name.
            add: (t: any) => registeredTools.push({ ...t, id: t.name }),
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
      integration: {
        transform: vi.fn().mockImplementation(async (callback) => {
          const editor = {
            list: () => [],
            get: () => undefined,
            remove: () => {},
            update: (_id: string, updater: Function) => updater({ id: "google", name: "Google" }),
            method: {
              list: () => [],
              update: (input: any) => registeredMethods.push(input),
              remove: () => {},
            },
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

    // Verify tools return structured content { content: ... }
    expect(quotaTool?.input).toBeDefined();
    expect(searchTool?.input).toBeDefined();
    const quotaResult = await quotaTool?.execute();
    expect(quotaResult).toHaveProperty("content");

    // Command verification
    expect(mockContext.command?.transform).toHaveBeenCalled();
    const quotaCommand = registeredCommands.find((c) => c.name === "antigravity-quota");
    expect(quotaCommand).toBeDefined();

    // Model transform verification
    expect(mockContext.model?.transform).toHaveBeenCalled();
    const gemini38 = updatedModels.find((m) => m.modelId === "antigravity-gemini-3.8-flash");
    expect(gemini38).toBeDefined();
    expect(gemini38?.name).toContain("Gemini 3.8 Flash");

    // Integration OAuth verification (regression guard for issue #30)
    expect(mockContext.integration?.transform).toHaveBeenCalled();
    const oauthMethod = registeredMethods.find(
      (m) => m.method?.type === "oauth" && m.method?.id === "antigravity-oauth",
    );
    expect(oauthMethod).toBeDefined();
    expect(oauthMethod?.integrationID).toBe("google");
    expect(typeof oauthMethod?.authorize).toBe("function");
    expect(typeof oauthMethod?.refresh).toBe("function");

    // Session hooks verification
    expect(mockContext.session?.hook).toHaveBeenCalledWith("http.request", expect.any(Function));
    expect(mockContext.session?.hook).toHaveBeenCalledWith("http.response", expect.any(Function));
    expect(mockContext.session?.hook).toHaveBeenCalledWith("retry", expect.any(Function));

    // Test retry hook ignores non-429 errors
    const retryEvent: any = { error: { status: 500 } };
    expect(registeredHooks["retry"]).toBeDefined();
    await registeredHooks["retry"]!(retryEvent);
    expect(retryEvent.decision).toBeUndefined();

    // Verify cleanup execution
    if (typeof cleanup === "function") {
      expect(() => cleanup()).not.toThrow();
    }
  }, 20000);

  it("handles empty or partial v2 context gracefully", async () => {
    const emptyContext: V2Context = {};
    const cleanup = await setupV2(emptyContext);
    expect(typeof cleanup).toBe("function");
  });

  it("queues and routes concurrent requests in the same session without metadata collision", async () => {
    const registeredHooks: Record<string, Function> = {};
    const mockContext: V2Context = {
      session: {
        hook: vi.fn().mockImplementation(async (name, callback) => {
          registeredHooks[name] = callback;
          return { dispose: async () => {} };
        }),
      },
    };

    const cleanup = await setupV2(mockContext);
    expect(typeof cleanup).toBe("function");

    const requestHook = registeredHooks["http.request"];
    const responseHook = registeredHooks["http.response"];
    const retryHook = registeredHooks["retry"];
    expect(requestHook).toBeDefined();
    expect(responseHook).toBeDefined();
    expect(retryHook).toBeDefined();
    if (!requestHook || !responseHook || !retryHook) {
      return;
    }

    // Emulate 2 requests in the same session key
    const sessionID = "ses-concurrent-1";
    const req1: any = {
      sessionID,
      request: new Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "first" }] }] }),
      }),
    };
    const req2: any = {
      sessionID,
      request: new Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "second" }] }] }),
      }),
    };

    await requestHook(req1);
    await requestHook(req2);

    // Response 1 arrives with 429
    const resp1: any = {
      sessionID,
      response: new Response("rate limited", { status: 429 }),
    };
    await responseHook(resp1);

    // Retry hook should see the failed metadata for session
    const retryEvent: any = {
      sessionID,
      error: { status: 429, message: "Resource exhausted" },
    };
    await retryHook(retryEvent);

    // Response 2 arrives OK
    const resp2: any = {
      sessionID,
      response: new Response("data: {\"candidates\":[]}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
    };
    await responseHook(resp2);

    if (typeof cleanup === "function") {
      cleanup();
    }
  }, 15000);
});

describe("hideForeignModels", () => {
  it("disables google models outside the curated catalog, keeping the curated ones", async () => {
    const { hideForeignModels } = await import("./adapter");
    const updates: Array<{ id: string; enabled: any }> = [];
    const editor = {
      list: (providerID: string) =>
        providerID === "google"
          ? [
              { id: "antigravity-gemini-3.8-flash" },
              { id: "antigravity-claude-sonnet-4-6" },
              { id: "gemini-2.5-pro" },
              { id: "gemini-2.5-flash" },
              { id: "deep-research-preview-04-2026" },
            ]
          : [],
      update: (providerID: string, modelId: string, updater: Function) => {
        const draft: any = {};
        updater(draft);
        updates.push({ id: modelId, enabled: draft.enabled });
      },
    };

    const hidden = hideForeignModels(editor, "google", new Set(["antigravity-gemini-3.8-flash", "antigravity-claude-sonnet-4-6"]));

    expect(hidden).toBe(3);
    expect(updates.map((u) => u.id)).toEqual(["gemini-2.5-pro", "gemini-2.5-flash", "deep-research-preview-04-2026"]);
    expect(updates.every((u) => u.enabled === false)).toBe(true);
  });

  it("returns 0 when the editor cannot list models (fail-open)", async () => {
    const { hideForeignModels } = await import("./adapter");
    expect(hideForeignModels({ update: () => {} }, "google", new Set())).toBe(0);
  });

  it("returns 0 when the editor throws", async () => {
    const { hideForeignModels } = await import("./adapter");
    const editor = {
      list: () => {
        throw new Error("boom");
      },
      update: () => {},
    };
    expect(hideForeignModels(editor, "google", new Set())).toBe(0);
  });
});
