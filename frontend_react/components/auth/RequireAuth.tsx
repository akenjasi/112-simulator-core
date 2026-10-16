"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export interface RequireAuthProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export default function RequireAuth({
  children,
  allowedRoles,
}: RequireAuthProps) {
  const { replace } = useRouter()
  const [ready, setReady] = useState(false)

  const rolesKey = allowedRoles ? allowedRoles.join(",") : ""

  useEffect(() => {
    let isMounted = true

    async function checkAuth() {
      let token: string | null = null
      try {
        token =
          localStorage.getItem("token") ||
          localStorage.getItem("access_token") ||
          localStorage.getItem("jwt_token")
      } catch {
        token = null
      }

      if (!token && typeof document !== "undefined") {
        try {
          const cookies = document.cookie ? document.cookie.split("; ") : []
          for (const c of cookies) {
            const [k, ...v] = c.split("=")
            const key = k.trim()
            if (key === "token" || key === "access_token" || key === "jwt_token") {
              token = decodeURIComponent(v.join("="))
              break
            }
          }
        } catch {
          // ignore
        }
      }

      if (!token) {
        if (isMounted) {
          replace("/login")
        }
        return
      }

      try {
        const res = await fetch("/api/v1/users/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          try {
            localStorage.removeItem("token")
            localStorage.removeItem("access_token")
            localStorage.removeItem("jwt_token")
            sessionStorage.removeItem("token")
            sessionStorage.removeItem("access_token")
            sessionStorage.removeItem("jwt_token")
            document.cookie = "token=; path=/; max-age=0"
            document.cookie = "access_token=; path=/; max-age=0"
            document.cookie = "jwt_token=; path=/; max-age=0"
          } catch {
            // ignore
          }
          if (isMounted) {
            replace("/login")
          }
          return
        }

        const data = await res.json()
        const userRole = data?.role

        const isAllowed =
          !allowedRoles ||
          allowedRoles.length === 0 ||
          allowedRoles.includes(userRole) ||
          (typeof userRole === "string" &&
            allowedRoles.some(
              (r) => r.toUpperCase() === userRole.toUpperCase()
            ))

        if (!isAllowed) {
          if (isMounted) {
            replace("/login")
          }
          return
        }

        if (isMounted) {
          setReady(true)
        }
      } catch {
        try {
          localStorage.removeItem("token")
          localStorage.removeItem("access_token")
          localStorage.removeItem("jwt_token")
          sessionStorage.removeItem("token")
          sessionStorage.removeItem("access_token")
          sessionStorage.removeItem("jwt_token")
          document.cookie = "token=; path=/; max-age=0"
          document.cookie = "access_token=; path=/; max-age=0"
          document.cookie = "jwt_token=; path=/; max-age=0"
        } catch {
          // ignore
        }
        if (isMounted) {
          replace("/login")
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [replace, rolesKey])

  if (!ready) {
    return null
  }

  return <>{children}</>
}

export { RequireAuth }
