"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import RequireAuth from "@/components/auth/RequireAuth"
import { LogoutButton } from "@/components/auth/LogoutButton"
import {
  LayoutDashboard,
  Users,
  Database,
  Home,
  Shield,
  Activity,
  Menu,
  SlidersHorizontal,
  X,
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
    name: "Политики и доступ ролей",
    href: "/admin/security",
    icon: SlidersHorizontal,
  },
  {
    name: "Профиль и 2FA",
    href: "/admin/profile",
    icon: Shield,
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let pathname = ""
  try {
    pathname = usePathname() || ""
  } catch {
    pathname = ""
  }

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  return (
    <RequireAuth allowedRoles={["ADMIN"]}>
      <div className="flex flex-col md:flex-row min-h-screen bg-slate-100 text-slate-800 font-sans admin-workspace">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b-2 border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-700 text-white rounded-lg shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-extrabold text-slate-900 leading-tight block">
              Система-112: Администратор
            </span>
            <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">
              Панель управления
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          data-testid="admin-mobile-menu-toggle"
          className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Mobile Navigation Drawer & Backdrop */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            data-testid="admin-mobile-backdrop"
          />
          <aside
            aria-label="Мобильное меню администратора"
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r-2 border-slate-200 z-50 flex flex-col justify-between shadow-2xl md:hidden animate-in slide-in-from-left duration-200"
          >
            <div>
              <div className="p-4 border-b-2 border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-700 text-white rounded-xl shadow-md">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 leading-tight">
                      Панель администратора
                    </h2>
                    <p className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">
                      Система-112 Core
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Закрыть панель"
                  data-testid="admin-drawer-close"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-4 space-y-2 overflow-y-auto" aria-label="Мобильная навигация панели управления">
                {adminNavItems.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))

                  return (
                    <Link
                      key={`mobile-${item.href}`}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3.5 px-4 py-3 rounded-xl font-bold text-base transition-all duration-150 outline-none focus:ring-2 focus:ring-purple-600 ${
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
              <LogoutButton className="mt-3" />
            </div>
          </aside>
        </>
      )}

      {/* Persistent Desktop Sidebar */}
      <aside
        aria-label="Боковое меню администратора"
        className="hidden md:flex w-72 shrink-0 bg-white border-r-2 border-slate-200 flex-col justify-between shadow-md z-30 sticky top-0 h-screen"
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
          <LogoutButton className="mt-3" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-slate-50 text-slate-900 p-4 sm:p-6 md:p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
      </div>
    </RequireAuth>
  )
}

export { AdminLayout }
