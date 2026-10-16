"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { clearStoredSession, getStoredToken } from "@/lib/auth-session"

interface LogoutButtonProps {
  className?: string
}

export function LogoutButton({ className = "" }: LogoutButtonProps) {
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
      className={`w-full rounded-xl border-2 border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-wait disabled:opacity-60 ${className}`}
    >
      {isLoggingOut ? "Выходим…" : "Выйти"}
    </button>
  )
}
