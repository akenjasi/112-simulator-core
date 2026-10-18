import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeSelect } from "@/components/theme-select"
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme"

let dark = false
let listener: (() => void) | undefined
const storage = new Map<string, string>()
function View() { return <ThemeProvider><ThemeSelect /></ThemeProvider> }

beforeEach(() => {
  dark = false
  listener = undefined
  storage.clear()
  document.documentElement.className = ""
  delete document.documentElement.dataset.themePreference
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return dark },
    addEventListener: (_: string, cb: () => void) => { listener = cb },
    removeEventListener: vi.fn(),
  })))
})
afterEach(() => vi.unstubAllGlobals())

describe("persistent theme selection", () => {
  it("applies the saved choice before first paint even when the system disagrees", () => {
    dark = true
    storage.set(THEME_STORAGE_KEY, "light")
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement).toHaveClass("light")
    expect(document.documentElement).not.toHaveClass("dark")
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it("persists manual choice and restores it after remount", async () => {
    const view = render(<View />)
    fireEvent.change(screen.getByRole("combobox", { name: "Тема" }), { target: { value: "dark" } })
    expect(document.documentElement).toHaveClass("dark")
    expect(storage.get(THEME_STORAGE_KEY)).toBe("dark")
    view.unmount()
    render(<View />)
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Тема" })).toHaveValue("dark"))
    expect(document.documentElement.style.colorScheme).toBe("dark")
  })

  it("follows system changes only when the user selects system", () => {
    render(<View />)
    act(() => { dark = true; listener?.() })
    expect(document.documentElement).toHaveClass("dark")
    fireEvent.change(screen.getByRole("combobox", { name: "Тема" }), { target: { value: "light" } })
    act(() => listener?.())
    expect(document.documentElement).toHaveClass("light")
    fireEvent.change(screen.getByRole("combobox", { name: "Тема" }), { target: { value: "system" } })
    expect(document.documentElement).toHaveClass("dark")
  })

  it("updates controls across tabs and falls back to system after a cleared setting", () => {
    render(<View />)
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" })))
    expect(screen.getByRole("combobox", { name: "Тема" })).toHaveValue("dark")
    expect(document.documentElement).toHaveClass("dark")
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null })))
    expect(document.documentElement).toHaveClass("light")
  })

  it("can switch themes when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked") }, setItem() { throw new Error("blocked") } })
    render(<View />)
    fireEvent.change(screen.getByRole("combobox", { name: "Тема" }), { target: { value: "dark" } })
    expect(document.documentElement).toHaveClass("dark")
  })
})
