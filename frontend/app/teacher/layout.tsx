"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import RequireAuth from "@/components/auth/RequireAuth"
import { ThemeSelect } from "@/components/theme-select"
import { LogoutButton } from "@/components/auth/LogoutButton"
import { Home, PlayCircle, Users, ClipboardList, FileText, BookOpen, Menu, X, Shield } from "lucide-react"
import { useSystemStatus } from "@/hooks/useSystemStatus"
import { SystemStatus } from "@/components/SystemStatus"
import styles from "./teacher-workspace.module.css"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
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

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const systemStatus = useSystemStatus()

  useEffect(() => { setIsMobileMenuOpen(false) }, [pathname])
  useEffect(() => {
    if (!isMobileMenuOpen) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isMobileMenuOpen])

  const navigation = (mobile = false) => navItems.map(({ href, icon: Icon, name }) => {
    const active = href === "/teacher" ? pathname === href : pathname.startsWith(href)
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}
      onClick={() => setIsMobileMenuOpen(false)}
      className={`${styles.navLink} ${active ? styles.active : ""} ${mobile ? styles.mobileLink : ""}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{name}</span>
    </Link>
  })

  return <RequireAuth allowedRoles={["TEACHER"]}>
    <div className={`${styles.workspace} teacher-workspace min-h-screen bg-slate-50 text-foreground dark:bg-slate-950`}>
      <a href="#teacher-content" className={styles.skipLink}>Перейти к содержимому</a>
      <header className="border-b border-border bg-card">
        <div className={styles.topbar}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground">112</span>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight sm:text-lg">Тренажёр Системы-112</p>
              <p className="text-xs text-muted-foreground sm:text-sm">Кабинет преподавателя · Обучение ДДС</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden xl:block"><SystemStatus status={systemStatus} variant="teacher" className={styles.systemStatus} /></div>
            <div className="hidden sm:block"><ThemeSelect compact /></div>
            <LogoutButton compact />
            <button ref={menuButton} type="button" onClick={() => setIsMobileMenuOpen(value => !value)}
              aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={isMobileMenuOpen} aria-controls="teacher-mobile-navigation"
              data-testid="teacher-mobile-menu-toggle"
              className="rounded-lg border border-border p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden">
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <nav aria-label="Основная навигация" className={`${styles.navigation} hidden md:flex`}>
          {navigation()}
        </nav>
      </header>

      {isMobileMenuOpen && <>
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" aria-hidden="true"
          data-testid="teacher-mobile-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
        <aside id="teacher-mobile-navigation" aria-label="Мобильное меню преподавателя"
          className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[90vw] flex-col border-l border-border bg-card p-5 shadow-xl md:hidden">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Кабинет преподавателя</h2>
            <button ref={closeButton} type="button" aria-label="Закрыть панель" data-testid="teacher-drawer-close"
              onClick={() => { setIsMobileMenuOpen(false); menuButton.current?.focus() }}
              className="rounded-lg p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Мобильная навигация преподавателя">{navigation(true)}</nav>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <SystemStatus status={systemStatus} variant="teacher" />
            <ThemeSelect />
          </div>
        </aside>
      </>}
      <main id="teacher-content" className={styles.content}>{children}</main>
      <footer className={styles.footer}>Тренажёр Системы-112 · Учебный режим ДДС</footer>
    </div>
  </RequireAuth>
}
