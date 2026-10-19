"use client"

import React from "react"
import RequireAuth from "@/components/auth/RequireAuth"

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireAuth allowedRoles={["CADET", "STUDENT"]}>
      {children}
    </RequireAuth>
  )
}
