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
