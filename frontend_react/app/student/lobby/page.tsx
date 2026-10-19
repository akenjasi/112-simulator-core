"use client"

import {useEffect} from "react"
import Link from "next/link"
import {useRouter} from "next/navigation"

/** Compatibility for bookmarks. The authenticated cadet home is /student/profile. */
export default function StudentLobbyRedirect() {
  const router = useRouter()
  useEffect(() => {router.replace("/student/profile")}, [router])
  return <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
    <p role="status">Открываем личный кабинет… <Link className="underline" href="/student/profile">Перейти в личный кабинет</Link></p>
  </main>
}
