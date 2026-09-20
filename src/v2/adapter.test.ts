import { describe, expect, it, vi } from "vitest";
import { setupV2, type V2Context } from "./adapter";

describe("OpenCode v2 Adapter", () => {
  it("initializes and registers tools and commands with OpenCode v2 context", async () => {
    const registeredTools: any[] = [];
    const registeredCommands: any[] = [];

    const mockContext: V2Context = {
      location: { directory: process.cwd() },
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

    expect(mockContext.tool?.transform).toHaveBeenCalled();
    expect(mockContext.command?.transform).toHaveBeenCalled();

    const quotaTool = registeredTools.find((t) => t.id === "antigravity_quota");
    expect(quotaTool).toBeDefined();
    expect(quotaTool?.description).toContain("Antigravity quota");

    const searchTool = registeredTools.find((t) => t.id === "google_search");
    expect(searchTool).toBeDefined();
    expect(searchTool?.description).toContain("Google Search");

    const quotaCommand = registeredCommands.find((c) => c.name === "antigravity-quota");
    expect(quotaCommand).toBeDefined();

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
