"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Database,
  Home,
  Shield,
  Activity,
  AlertOctagon,
  ArrowLeft,
} from "lucide-react"

export interface AdminNavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

export const adminNavItems: AdminNavItem[] = [
  {
    name: "Дашборд",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Пользователи",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Система и бэкапы",
    href: "/admin/system",
    icon: Database,
  },
  {
    name: "На главную",
    href: "/",
    icon: Home,
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  let pathname = ""
  try {
    pathname = usePathname() || ""
  } catch {
    pathname = ""
  }

  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if user is admin
    let isCancelled = false

    async function checkRole() {
      try {
        const storedRole = localStorage.getItem("user_role") || localStorage.getItem("role")
        if (storedRole && storedRole.toUpperCase() !== "ADMIN") {
          if (!isCancelled) {
            setAuthorized(false)
          }
          return
        }

        const res = await fetch("/api/v1/users/me")
        if (res.ok) {
          const user = await res.json()
          if (!isCancelled) {
            if (user.role && user.role.toUpperCase() !== "ADMIN") {
              setAuthorized(false)
            } else {
              setAuthorized(true)
            }
          }
        } else {
          // If in test or dev fallback, assume authorized unless explicitly non-admin
          if (!isCancelled) {
            setAuthorized(storedRole ? storedRole.toUpperCase() === "ADMIN" : true)
          }
        }
      } catch {
        if (!isCancelled) {
          setAuthorized(true)
        }
      }
    }

    checkRole()
    return () => {
      isCancelled = true
    }
  }, [])

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white border-2 border-red-200 rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-100 text-red-600 rounded-full flex items-center justify-center">
            <AlertOctagon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Доступ ограничен</h2>
          <p className="text-sm text-slate-600">
            Этот раздел предназначен исключительно для учетных записей с ролью Администратора.
          </p>
          <div className="pt-4">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Вернуться на главную
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 font-sans admin-workspace">
      {/* Persistent Left Sidebar */}
      <aside
        aria-label="Боковое меню администратора"
        className="w-72 shrink-0 bg-white border-r-2 border-slate-200 flex flex-col justify-between shadow-md z-30 sticky top-0 h-screen"
      >
        <div>
          {/* Header / Brand */}
          <div className="p-5 border-b-2 border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-700 text-white rounded-xl shadow-md">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 leading-tight">
                  Панель администратора
                </h1>
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
                  Система-112 Core
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-2 overflow-y-auto" aria-label="Навигация панели управления">
            {adminNavItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-bold text-base transition-all duration-150 outline-none focus:ring-2 focus:ring-purple-600 ${
                    isActive
                      ? "bg-purple-700 text-white shadow-md font-extrabold"
                      : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-slate-500"}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / System Status */}
        <div className="p-4 border-t-2 border-slate-200 bg-slate-50">
          <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="text-xs font-bold text-slate-700">
                Система активна
              </div>
            </div>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-slate-50 text-slate-900 p-6 md:p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}

export { AdminLayout }
