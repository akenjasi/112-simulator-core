"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { clearStoredSession, getStoredToken } from "@/lib/auth-session"

interface LogoutButtonProps {
  className?: string
  compact?: boolean
}

export function LogoutButton({ className = "", compact = false }: LogoutButtonProps) {
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    const token = getStoredToken()

    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch {
      // Local logout must still succeed when the server is unavailable.
    } finally {
      clearStoredSession()
      router.replace("/login")
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      aria-busy={isLoggingOut}
      aria-label={isLoggingOut ? "Выполняется выход" : "Выйти"}
      className={`${
        compact
          ? "inline-flex h-8 w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20 focus:ring-destructive/30"
          : "w-full rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/20 focus:ring-destructive/30"
      } transition-colors focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {compact && <LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className={compact ? "hidden sm:inline" : undefined}>
        {isLoggingOut ? "Выходим…" : "Выйти"}
      </span>
    </button>
  )
}
