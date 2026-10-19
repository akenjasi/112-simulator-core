"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import RequireAuth from "@/components/auth/RequireAuth"
import { ThemeSelect } from "@/components/theme-select"
import { LogoutButton } from "@/components/auth/LogoutButton"
import {
  LayoutDashboard,
  Users,
  Database,
  Home,
  Shield,
  Menu,
  SlidersHorizontal,
  ScrollText,
  X,
} from "lucide-react"
import { useSystemStatus } from "@/hooks/useSystemStatus"
import { SystemStatus } from "@/components/SystemStatus"

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
    name: "Журналы",
    href: "/admin/logs",
    icon: ScrollText,
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
  const systemStatus = useSystemStatus()

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  return (
    <RequireAuth allowedRoles={["ADMIN"]}>
      <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground font-sans admin-workspace">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-extrabold text-sidebar-foreground leading-tight block">
              Система-112: Администратор
            </span>
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              Панель управления
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          data-testid="admin-mobile-menu-toggle"
          className="p-2 rounded-lg text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
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
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar border-r border-sidebar-border z-50 flex flex-col justify-between shadow-2xl md:hidden animate-in slide-in-from-left duration-200"
          >
            <div>
              <div className="p-4 border-b border-sidebar-border bg-sidebar flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-primary text-primary-foreground rounded-xl shadow-md">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-sidebar-foreground leading-tight">
                      Панель администратора
                    </h2>
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                      Система-112 Core
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Закрыть панель"
                  data-testid="admin-drawer-close"
                  className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
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
                      className={`flex items-center gap-3.5 px-4 py-3 rounded-xl font-bold text-base transition-all duration-150 outline-none focus:ring-2 focus:ring-primary ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm font-extrabold"
                          : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/75"}`} />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-sidebar-border bg-sidebar">
              <SystemStatus status={systemStatus} variant="admin" />
              <div className="mt-3"><ThemeSelect /></div>
              <LogoutButton className="mt-3" />
            </div>
          </aside>
        </>
      )}

      {/* Persistent Desktop Sidebar */}
      <aside
        aria-label="Боковое меню администратора"
        className="hidden md:flex w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex-col justify-between shadow-md z-30 sticky top-0 h-screen"
      >
        <div>
          {/* Header / Brand */}
          <div className="p-5 border-b border-sidebar-border bg-sidebar">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow-md">
                <Shield className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-sidebar-foreground leading-tight">
                  Панель администратора
                </h1>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider">
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
                  className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-bold text-base transition-all duration-150 outline-none focus:ring-2 focus:ring-primary ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm font-extrabold"
                      : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/75"}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / System Status */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar">
          <SystemStatus status={systemStatus} variant="admin" />
          <div className="mt-3"><ThemeSelect /></div>
              <LogoutButton className="mt-3" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-background text-foreground p-4 sm:p-6 md:p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
      </div>
    </RequireAuth>
  )
}

export { AdminLayout }
