"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import RequireAuth from "@/components/auth/RequireAuth"
import { ThemeSelect } from "@/components/theme-select"
import { LogoutButton } from "@/components/auth/LogoutButton"
import {
  Home,
  PlayCircle,
  Users,
  ClipboardList,
  FileText,
  BookOpen,
  GraduationCap,
  Menu,
  X,
  Shield,
} from "lucide-react"
import { useSystemStatus } from "@/hooks/useSystemStatus"
import { SystemStatus } from "@/components/SystemStatus"

export interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

export const navItems: NavItem[] = [
  {
    name: "Главная страница",
    href: "/teacher",
    icon: Home,
  },
  {
    name: "Начать урок",
    href: "/teacher/sessions/new",
    icon: PlayCircle,
  },
  {
    name: "Ученики",
    href: "/teacher/groups",
    icon: Users,
  },
  {
    name: "Журнал оценок",
    href: "/teacher/analytics",
    icon: ClipboardList,
  },
  {
    name: "База билетов",
    href: "/teacher/tickets",
    icon: FileText,
  },
  {
    name: "Справочник",
    href: "/teacher/knowledge",
    icon: BookOpen,
  },
  {
    name: "Профиль и 2FA",
    href: "/teacher/profile",
    icon: Shield,
  },
]

export default function TeacherLayout({
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
    <RequireAuth allowedRoles={["TEACHER"]}>
      <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground font-sans teacher-workspace">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary text-primary-foreground rounded-lg shadow-sm">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-extrabold text-sidebar-foreground leading-tight block">
              Тренажер 112: Преподаватель
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
          data-testid="teacher-mobile-menu-toggle"
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
            data-testid="teacher-mobile-backdrop"
          />
          <aside
            aria-label="Мобильное меню преподавателя"
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar border-r border-sidebar-border z-50 flex flex-col justify-between shadow-2xl md:hidden animate-in slide-in-from-left duration-200"
          >
            <div>
              <div className="p-4 border-b border-sidebar-border bg-sidebar flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-primary text-primary-foreground rounded-xl shadow">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-sidebar-foreground leading-tight">
                      Кабинет преподавателя
                    </h2>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Тренажер 112
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Закрыть панель"
                  data-testid="teacher-drawer-close"
                  className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-4 space-y-2 overflow-y-auto" aria-label="Мобильная навигация преподавателя">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.href === "/teacher"
                      ? pathname === "/teacher"
                      : pathname.startsWith(item.href)

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
                      <Icon className={`w-6 h-6 shrink-0 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/75"}`} />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-sidebar-border bg-sidebar">
              <SystemStatus status={systemStatus} variant="teacher" />
              <div className="mt-3"><ThemeSelect /></div>
              <LogoutButton className="mt-3" />
            </div>
          </aside>
        </>
      )}

      {/* Persistent Left Sidebar - Never collapses to hamburger on desktop */}
      <aside
        aria-label="Боковое меню преподавателя"
        className="hidden md:flex w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex-col justify-between shadow-md z-30 sticky top-0 h-screen"
      >
        <div>
          {/* Header / Brand */}
          <div className="p-5 border-b border-sidebar-border bg-sidebar">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary text-primary-foreground rounded-xl shadow">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-sidebar-foreground leading-tight">
                  Кабинет преподавателя
                </h1>
                <p className="text-sm font-semibold text-muted-foreground">
                  Тренажер 112
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-2 overflow-y-auto" aria-label="Основная навигация">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === "/teacher"
                  ? pathname === "/teacher"
                  : pathname.startsWith(item.href)

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
                  <Icon className={`w-6 h-6 shrink-0 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/75"}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / System Status */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar">
          <SystemStatus status={systemStatus} variant="teacher" />
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

export { TeacherLayout }
