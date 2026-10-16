"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const roleDestinations: Record<string, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher/sessions",
  CADET: "/student/profile",
  STUDENT: "/student/profile",
}

export default function LandingPage() {
  const { replace } = useRouter()

  useEffect(() => {
    let cancelled = false
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("jwt_token")

    const clearSession = () => {
      ;["token", "access_token", "jwt_token"].forEach((key) => localStorage.removeItem(key))
    }

    if (!token) {
      replace("/login")
      return
    }

    async function redirectToCabinet() {
      try {
        const response = await fetch("/api/v1/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error("Session is not valid")
        }

        const user: { role?: string } = await response.json()
        const destination = user.role ? roleDestinations[user.role.toUpperCase()] : undefined
        if (!destination) {
          throw new Error("Unknown user role")
        }

        if (!cancelled) {
          replace(destination)
        }
      } catch {
        clearSession()
        if (!cancelled) {
          replace("/login")
        }
      }
    }

    void redirectToCabinet()
    return () => {
      cancelled = true
    }
  }, [replace])

  return null
}
