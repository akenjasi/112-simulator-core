"use client"

import { useId } from "react"
import { SunMoon } from "lucide-react"
import { useTheme, type ThemePreference } from "@/components/theme-provider"

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const theme = useTheme()
  const id = useId()
  if (!theme) return null
  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? "" : "w-full"}`}>
      <label htmlFor={id} className="flex shrink-0 items-center gap-1.5 text-sm text-foreground">
        <SunMoon className="h-4 w-4" aria-hidden="true" />
        <span className={compact ? "sr-only" : ""}>Тема</span>
      </label>
      <select
        id={id}
        value={theme.theme}
        onChange={(event) => theme.setTheme(event.target.value as ThemePreference)}
        className="min-w-0 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
        <option value="system">Как в системе</option>
      </select>
    </div>
  )
}
