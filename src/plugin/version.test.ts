import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Regression tests for the version fallback mechanism.
 *
 * Issue #468: On WSL2/AlmaLinux with strict firewall rules, both the
 * auto-updater API and changelog fetch fail. The plugin then uses the
 * hardcoded fallback version in User-Agent headers. If the fallback is
 * too old, the backend rejects requests for newer models (e.g., Gemini 3.1 Pro)
 * with "not available on this version".
 *
 * These tests verify the fallback is current and that the
 * network-failure path correctly uses it.
 */

// Reset module state between tests so versionLocked starts fresh
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ANTIGRAVITY_VERSION_FALLBACK", () => {
  it("defaults to the exported fallback constant", async () => {
    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("is at least 1.18.0 to support Gemini 3.1 Pro", async () => {
    const { getAntigravityVersion } = await import("../constants.ts")
    const [major, minor] = getAntigravityVersion().split(".").map(Number)
    expect(major).toBeGreaterThanOrEqual(1)
    if (major === 1) expect(minor).toBeGreaterThanOrEqual(18)
  })
})

describe("setAntigravityVersion", () => {
  it("updates the version on first call", async () => {
    const { getAntigravityVersion, setAntigravityVersion } = await import("../constants.ts")
    setAntigravityVersion("2.0.0")
    expect(getAntigravityVersion()).toBe("2.0.0")
  })

  it("locks after first call — subsequent calls are ignored", async () => {
    const { getAntigravityVersion, setAntigravityVersion } = await import("../constants.ts")
    setAntigravityVersion("2.0.0")
    setAntigravityVersion("3.0.0")
    expect(getAntigravityVersion()).toBe("2.0.0")
  })
})

describe("initAntigravityVersion — network failure path", () => {
  it("falls back to hardcoded version when both fetches throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("falls back to hardcoded version when both fetches return non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }),
    )

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("uses API version when auto-updater responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "1.19.0" }),
    )

    const { getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe("1.19.0")
  })

  it("fallback version appears in User-Agent header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityHeaders } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    const headers = getAntigravityHeaders()
    expect(headers["User-Agent"]).toContain(`Antigravity/${ANTIGRAVITY_VERSION_FALLBACK}`)
  })

  it("fallback version appears in randomized antigravity headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getRandomizedHeaders } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    const headers = getRandomizedHeaders("antigravity")
    expect(headers["User-Agent"]).toContain(ANTIGRAVITY_VERSION_FALLBACK)
  })
})

describe("Antigravity CLI version", () => {
  it("defaults to the exported fallback constant", async () => {
    const { ANTIGRAVITY_CLI_VERSION_FALLBACK, getAntigravityCliVersion } = await import("../constants.ts")
    expect(getAntigravityCliVersion()).toBe(ANTIGRAVITY_CLI_VERSION_FALLBACK)
  })

  it("is a version the CLI signature format expects", async () => {
    const { getAntigravityCliVersion } = await import("../constants.ts")
    expect(getAntigravityCliVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("locks after the first set, like the IDE version", async () => {
    const { setAntigravityCliVersion, getAntigravityCliVersion } = await import("../constants.ts")
    setAntigravityCliVersion("1.4.2")
    setAntigravityCliVersion("9.9.9")
    expect(getAntigravityCliVersion()).toBe("1.4.2")
  })
})

describe("initAntigravityCliVersion", () => {
  it("updates the version from the CLI auto-updater endpoint", async () => {
    const { initAntigravityCliVersion, CLI_VERSION_URL } = await import("./version.ts")
    const { getAntigravityCliVersion } = await import("../constants.ts")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "Antigravity CLI auto updater is running! Stable Version: 1.4.2. Rolled out to 100%",
    })
    vi.stubGlobal("fetch", fetchMock)

    await initAntigravityCliVersion()

    expect(fetchMock).toHaveBeenCalledWith(CLI_VERSION_URL, expect.anything())
    expect(getAntigravityCliVersion()).toBe("1.4.2")
  })

  it("keeps the fallback when the endpoint fails", async () => {
    const { initAntigravityCliVersion } = await import("./version.ts")
    const { ANTIGRAVITY_CLI_VERSION_FALLBACK, getAntigravityCliVersion } = await import("../constants.ts")

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(initAntigravityCliVersion()).resolves.toBeUndefined()
    expect(getAntigravityCliVersion()).toBe(ANTIGRAVITY_CLI_VERSION_FALLBACK)
  })

  it("keeps the fallback when the endpoint returns a non-ok response", async () => {
    const { initAntigravityCliVersion } = await import("./version.ts")
    const { ANTIGRAVITY_CLI_VERSION_FALLBACK, getAntigravityCliVersion } = await import("../constants.ts")

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }))

    await initAntigravityCliVersion()
    expect(getAntigravityCliVersion()).toBe(ANTIGRAVITY_CLI_VERSION_FALLBACK)
  })
})
