"use client"

import Link from "next/link"
import { ArrowRight, BookOpen, ClipboardList, FileText, PlayCircle, Users } from "lucide-react"

const destinations = [
  { href: "/teacher/groups", title: "Ученики", description: "Просмотр и создание учебных групп, добавление существующих курсантов и импорт состава группы из CSV.", action: "Открыть список", Icon: Users },
  { href: "/teacher/analytics", title: "Журнал оценок", description: "Сводная ведомость результатов, разбор ошибок курсантов, история действий и пересмотр баллов при апелляции.", action: "Смотреть журнал", Icon: ClipboardList },
  { href: "/teacher/tickets", title: "База билетов", description: "Каталог экзаменационных заданий, автоматическая генерация новых билетов и настройка эталонных решений.", action: "Перейти к билетам", Icon: FileText },
  { href: "/teacher/knowledge", title: "Справочник", description: "Методические материалы, регламенты реагирования экстренных служб и база знаний для подготовки.", action: "Открыть материалы", Icon: BookOpen },
]

export default function TeacherMainPage() {
  return (
    <div className="teacher-page space-y-5">
      <header className="teacher-page-header flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Тренажёр Системы-112</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">Рабочее место преподавателя</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Управляйте учебными группами и занятиями, просматривайте результаты и материалы курса.
        </p>
      </header>

      <section aria-labelledby="lesson-heading" className="teacher-panel rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PlayCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Основное действие</p>
              <h2 id="lesson-heading" className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Начать урок</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Запустить учебную смену для группы: настроить профиль подготовки, выбрать экзаменационные билеты и наблюдать за работой курсантов в реальном времени.
              </p>
            </div>
          </div>
          <Link href="/teacher/sessions/new" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Запустить урок <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="sections-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="sections-heading" className="text-lg font-semibold tracking-tight text-foreground">Разделы преподавателя</h2>
            <p className="mt-1 text-sm text-muted-foreground">Быстрый доступ к повседневным задачам.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {destinations.map(({ href, title, description, action, Icon }) => (
            <Link key={href} href={href} className="group teacher-panel flex min-h-40 flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground group-hover:text-primary">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </div>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">{action}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
