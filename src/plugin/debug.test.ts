import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "./config"

const { ensureGitignoreSyncMock } = vi.hoisted(() => ({
  ensureGitignoreSyncMock: vi.fn(),
}))

vi.mock("./storage", () => ({
  ensureGitignoreSync: ensureGitignoreSyncMock,
}))

describe("debug sink policy", () => {
  let originalDebugEnv: string | undefined
  let originalDebugTuiEnv: string | undefined

  beforeEach(() => {
    vi.resetModules()
    originalDebugEnv = process.env.OPENCODE_ANTIGRAVITY_DEBUG
    originalDebugTuiEnv = process.env.OPENCODE_ANTIGRAVITY_DEBUG_TUI
    delete process.env.OPENCODE_ANTIGRAVITY_DEBUG
    delete process.env.OPENCODE_ANTIGRAVITY_DEBUG_TUI
    ensureGitignoreSyncMock.mockReset()
  })

  afterEach(() => {
    if (originalDebugEnv === undefined) {
      delete process.env.OPENCODE_ANTIGRAVITY_DEBUG
    } else {
      process.env.OPENCODE_ANTIGRAVITY_DEBUG = originalDebugEnv
    }

    if (originalDebugTuiEnv === undefined) {
      delete process.env.OPENCODE_ANTIGRAVITY_DEBUG_TUI
    } else {
      process.env.OPENCODE_ANTIGRAVITY_DEBUG_TUI = originalDebugTuiEnv
    }
  })

  it("keeps debug_tui independent from debug in config", async () => {
    const { initializeDebug, isDebugEnabled, isDebugTuiEnabled, getLogFilePath } = await import("./debug")

    initializeDebug({
      ...DEFAULT_CONFIG,
      debug: false,
      debug_tui: true,
    })

    expect(isDebugEnabled()).toBe(false)
    expect(isDebugTuiEnabled()).toBe(true)
    expect(getLogFilePath()).toBeUndefined()
  })

  it("keeps debug_tui independent from debug in env fallback", async () => {
    process.env.OPENCODE_ANTIGRAVITY_DEBUG = "0"
    process.env.OPENCODE_ANTIGRAVITY_DEBUG_TUI = "1"

    const { isDebugEnabled, isDebugTuiEnabled, getLogFilePath } = await import("./debug")

    expect(isDebugEnabled()).toBe(false)
    expect(isDebugTuiEnabled()).toBe(true)
    expect(getLogFilePath()).toBeUndefined()
  })

  it("keeps file debug enabled without TUI when only debug is true", async () => {
    const { initializeDebug, isDebugEnabled, isDebugTuiEnabled, getLogFilePath } = await import("./debug")

    initializeDebug({
      ...DEFAULT_CONFIG,
      debug: true,
      debug_tui: false,
      log_dir: "/tmp/opencode-antigravity-debug-tests",
    })

    expect(isDebugEnabled()).toBe(true)
    expect(isDebugTuiEnabled()).toBe(false)
    expect(getLogFilePath()).toContain("antigravity-debug-")
  })
})

describe("request audit dump", () => {
  let logDir: string

  beforeEach(async () => {
    const { mkdtempSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    logDir = mkdtempSync(join(tmpdir(), "antigravity-audit-"))
  })

  afterEach(async () => {
    const { rmSync } = await import("node:fs")
    rmSync(logDir, { recursive: true, force: true })
  })

  it("builds the audit document around the parsed body", async () => {
    const { buildRequestAudit } = await import("./debug")

    const audit = buildRequestAudit(
      JSON.stringify({ model: "claude-sonnet-5-5-low", request: { contents: [] } }),
      { url: "https://example.test/v1internal:streamGenerateContent", model: "claude-sonnet-5-5-low", headerKeys: ["Authorization", "User-Agent"] },
    )

    expect(audit["model"]).toBe("claude-sonnet-5-5-low")
    expect(audit["headerKeys"]).toEqual(["Authorization", "User-Agent"])
    expect((audit["body"] as any).request).toEqual({ contents: [] })
    expect(typeof audit["createdAt"]).toBe("string")
  })

  it("writes last-request.json with the body and no header values", async () => {
    const { writeRequestAudit } = await import("./debug")
    const { initializeDebug } = await import("./debug")
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")

    initializeDebug({ ...DEFAULT_CONFIG, debug: true, debug_tui: false, log_dir: logDir })

    const target = writeRequestAudit(
      JSON.stringify({ model: "gemini-3.8-flash-high", request: { contents: [{ role: "user", parts: [{ text: "2+2" }] }] } }),
      { url: "https://example.test/v1internal:streamGenerateContent", model: "gemini-3.8-flash-high", headerKeys: ["Authorization"] },
    )

    expect(target).toBe(join(logDir, "last-request.json"))
    const written = JSON.parse(readFileSync(target as string, "utf8"))
    expect(written.body.request.contents[0].parts[0].text).toBe("2+2")
    // Only names: the bearer token must never reach the file.
    expect(written.headerKeys).toEqual(["Authorization"])
    expect(JSON.stringify(written)).not.toContain("Bearer ")
  })

  it("does nothing when debug is disabled", async () => {
    const { initializeDebug, writeRequestAudit } = await import("./debug")

    initializeDebug({ ...DEFAULT_CONFIG, debug: false, debug_tui: false, log_dir: logDir })

    expect(writeRequestAudit(JSON.stringify({ a: 1 }))).toBeUndefined()
  })
})
