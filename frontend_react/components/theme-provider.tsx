"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"

import { THEME_STORAGE_KEY, isTheme, type ThemePreference } from "@/lib/theme"
export type { ThemePreference } from "@/lib/theme"

const ThemeContext = createContext<{
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
} | null>(null)

function applyTheme(theme: ThemePreference) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  const root = document.documentElement
  root.classList.toggle("dark", Boolean(dark))
  root.classList.toggle("light", !dark)
  root.dataset.themePreference = theme
  root.style.colorScheme = dark ? "dark" : "light"
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", dark ? "#10151D" : "#ffffff")
  })
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setPreference] = useState<ThemePreference>("light")
  const currentTheme = useRef<ThemePreference>("light")

  const update = useCallback((value: ThemePreference) => {
    currentTheme.current = value
    applyTheme(value)
    setPreference(value)
  }, [])

  const setTheme = useCallback((value: ThemePreference) => {
    if (!isTheme(value)) return
    update(value)
    try { localStorage.setItem(THEME_STORAGE_KEY, value) } catch { /* The current tab can still switch themes. */ }
  }, [update])

  useEffect(() => {
    let preference: unknown = document.documentElement.dataset.themePreference
    try { preference = localStorage.getItem(THEME_STORAGE_KEY) ?? preference } catch { /* Storage may be unavailable. */ }
    update(isTheme(preference) ? preference : "light")
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    const systemChanged = () => { if (currentTheme.current === "system") applyTheme("system") }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        update(isTheme(event.newValue) ? event.newValue : "light")
      }
    }
    media?.addEventListener("change", systemChanged)
    window.addEventListener("storage", storageChanged)
    return () => {
      media?.removeEventListener("change", systemChanged)
      window.removeEventListener("storage", storageChanged)
    }
  }, [update])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() { return useContext(ThemeContext) }
