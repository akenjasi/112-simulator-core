"use client"

import React from "react"
import RequireAuth from "@/components/auth/RequireAuth"
import { LogoutButton } from "@/components/auth/LogoutButton"

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireAuth allowedRoles={["CADET", "STUDENT"]}>
      <div className="relative min-h-screen">
        <div className="fixed right-4 top-4 z-50 w-32">
          <LogoutButton />
        </div>
        {children}
      </div>
    </RequireAuth>
  )
}

export { StudentLayout }
