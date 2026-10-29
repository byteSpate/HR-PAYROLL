import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ active: 0, peak: 0, kill: () => {} }))

vi.mock("puppeteer", () => ({
  default: {
    launch: async () => ({
      newPage: async () => ({
        setContent: async () => undefined,
        pdf: async () => {
          state.active += 1
          state.peak = Math.max(state.peak, state.active)
          await new Promise((resolve) => setTimeout(resolve, 15))
          state.active -= 1
          return new Uint8Array([37, 80, 68, 70])
        },
        close: async () => undefined,
      }),
      close: async () => undefined,
      process: () => ({ kill: () => state.kill() }),
    }),
  },
}))

import { renderPdf } from "./pdf.js"

describe("process hooks", () => {
  it("never intercepts SIGINT or SIGTERM, which would stop the host process from exiting on them", async () => {
    const before = { int: process.listenerCount("SIGINT"), term: process.listenerCount("SIGTERM") }
    vi.resetModules()
    await import("./pdf.js")
    expect(process.listenerCount("SIGINT")).toBe(before.int)
    expect(process.listenerCount("SIGTERM")).toBe(before.term)
  })

  it("stops Chromium synchronously when the process exits", async () => {
    const kill = vi.fn()
    state.kill = kill
    const known = new Set(process.listeners("exit"))
    vi.resetModules()
    const fresh = await import("./pdf.js")
    await fresh.renderPdf("<p>hi</p>")
    const ours = process.listeners("exit").filter((listener) => !known.has(listener))
    expect(ours).toHaveLength(1)
    ;(ours[0] as () => void)()
    expect(kill).toHaveBeenCalled()
    process.removeListener("exit", ours[0] as () => void)
  })
})

describe("renderPdf", () => {
  it("makes at most 2 PDFs at a time, however many are asked for", async () => {
    // One shared Chromium on a 512 MB dyno. Six at once would use its memory.
    const results = await Promise.all(Array.from({ length: 6 }, () => renderPdf("<p>hello</p>")))

    expect(results).toHaveLength(6)
    expect(results.every((r) => r.length === 4)).toBe(true)
    expect(state.peak).toBe(2)
  })
})
