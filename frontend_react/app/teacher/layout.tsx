"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  PlayCircle,
  Users,
  ClipboardList,
  FileText,
  BookOpen,
  GraduationCap,
} from "lucide-react"

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

  return (
    <div className="flex min-h-screen bg-gray-100 text-[#49555d] font-sans teacher-workspace">
      {/* Persistent Left Sidebar - Never collapses to hamburger on desktop */}
      <aside
        aria-label="Боковое меню преподавателя"
        className="w-72 shrink-0 bg-white border-r-2 border-[#c9ced1] flex flex-col justify-between shadow-md z-30 sticky top-0 h-screen"
      >
        <div>
          {/* Header / Brand */}
          <div className="p-5 border-b-2 border-[#c9ced1] bg-[#fbfdfe]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#157dbd] text-white rounded-xl shadow">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-[#49555d] leading-tight">
                  Кабинет преподавателя
                </h1>
                <p className="text-sm font-semibold text-[#49555d]/80">
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
                  className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-bold text-base transition-all duration-150 outline-none focus:ring-2 focus:ring-[#157dbd] ${
                    isActive
                      ? "bg-[#157dbd] text-white shadow-md font-extrabold"
                      : "text-[#49555d] hover:bg-slate-200/80 active:bg-slate-300"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className={`w-6 h-6 shrink-0 ${isActive ? "text-white" : "text-[#49555d]"}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer / System Status */}
        <div className="p-4 border-t-2 border-[#c9ced1] bg-[#fbfdfe]">
          <div className="p-3 bg-white border-2 border-[#c9ced1] rounded-xl flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="text-sm font-bold text-[#49555d]">
              Система активна
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-white text-[#49555d] p-6 md:p-8 overflow-y-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}

export { TeacherLayout }
