"use client"

import React from "react"
import Link from "next/link"
import {
  PlayCircle,
  Users,
  ClipboardList,
  FileText,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react"

export default function TeacherMainPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Title block */}
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
          Рабочее место преподавателя
        </h1>
        <p className="text-lg md:text-xl font-medium text-muted-foreground">
          Выберите нужное действие для работы с курсантами, экзаменационными билетами и оценками.
        </p>
      </div>

      {/* Primary Accent Tile: "Начать урок" */}
      <div className="w-full">
        <Link
          href="/teacher/sessions/new"
          className="group block p-8 md:p-10 rounded-2xl bg-gradient-to-r from-sky-700 to-blue-700 dark:from-card dark:to-secondary text-white shadow-xl hover:shadow-2xl transition-all duration-200 border-2 border-primary/40 hover:border-sky-300 dark:hover:border-primary focus:outline-none focus:ring-4 focus:ring-primary/30"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl shrink-0 group-hover:scale-105 transition-transform">
                <PlayCircle className="w-12 h-12 text-white" />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400 text-slate-900 dark:bg-amber-400/20 dark:text-amber-300 dark:border dark:border-amber-400/30 text-sm font-black uppercase tracking-wider rounded-lg shadow-xs">
                  <Sparkles className="w-4 h-4" />
                  Основное действие
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white">
                  Начать урок
                </h2>
                <p className="text-base md:text-lg text-blue-50 font-semibold max-w-2xl leading-relaxed">
                  Запустить учебную смену для группы: настроить профиль подготовки, выбрать экзаменационные билеты и наблюдать за работой курсантов в реальном времени.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-3 bg-white text-blue-900 dark:bg-primary dark:text-primary-foreground dark:border dark:border-primary/60 px-6 py-4 rounded-xl font-black text-lg shadow-md group-hover:bg-blue-50 dark:group-hover:bg-primary/90 transition-colors">
              <span>Запустить урок</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>

      {/* Grid of Secondary Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Плитка: Ученики */}
        <Link
          href="/teacher/groups"
          className="group p-6 md:p-7 rounded-2xl bg-card border-2 border-border hover:border-primary/80 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col justify-between focus:outline-none focus:ring-4 focus:ring-primary/20"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-primary/10 text-primary rounded-xl w-fit group-hover:scale-105 transition-transform">
              <Users className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors">
                Ученики
              </h3>
              <p className="text-base font-semibold text-muted-foreground leading-normal">
                Просмотр и создание учебных групп, добавление существующих курсантов и импорт состава группы из CSV.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between font-bold text-base text-primary">
            <span>Открыть список</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Плитка: Журнал оценок */}
        <Link
          href="/teacher/analytics"
          className="group p-6 md:p-7 rounded-2xl bg-card border-2 border-border hover:border-emerald-600 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col justify-between focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
              <ClipboardList className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Журнал оценок
              </h3>
              <p className="text-base font-semibold text-muted-foreground leading-normal">
                Сводная ведомость результатов, разбор ошибок курсантов, история действий и пересмотр баллов при апелляции.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between font-bold text-base text-emerald-600 dark:text-emerald-400">
            <span>Смотреть журнал</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Плитка: База билетов */}
        <Link
          href="/teacher/tickets"
          className="group p-6 md:p-7 rounded-2xl bg-card border-2 border-border hover:border-amber-600 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col justify-between focus:outline-none focus:ring-4 focus:ring-amber-500/20"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
              <FileText className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                База билетов
              </h3>
              <p className="text-base font-semibold text-muted-foreground leading-normal">
                Каталог экзаменационных заданий, автоматическая генерация новых билетов и настройка эталонных решений.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between font-bold text-base text-amber-600 dark:text-amber-400">
            <span>Перейти к билетам</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Плитка: Справочник */}
        <Link
          href="/teacher/knowledge"
          className="group p-6 md:p-7 rounded-2xl bg-card border-2 border-border hover:border-indigo-500 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col justify-between focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                Справочник
              </h3>
              <p className="text-base font-semibold text-muted-foreground leading-normal">
                Методические материалы, регламенты реагирования экстренных служб и база знаний для подготовки.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between font-bold text-base text-indigo-600 dark:text-indigo-400">
            <span>Открыть материалы</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  )
}
