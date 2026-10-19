"use client"

import Link from "next/link"
import {ArrowRight, Radio, RefreshCw} from "lucide-react"
import {activityUrl, type StudentWorkspace} from "@/lib/student-workspace"

export function ProfileAssignments({workspace, loading, error, onReload}: {
  workspace: StudentWorkspace | null; loading: boolean; error: string | null; onReload: () => void
}) {
  const lessons = workspace?.activities.filter(item => item.kind === "teacher") || []
  const conflict = lessons.length > 1
  const lesson = lessons[0]
  return <section aria-labelledby="assigned-heading" className="rounded-2xl border border-border bg-card shadow-xs">
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary"><Radio className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wider">Обучение в реальном времени</span></div>
        <h2 id="assigned-heading" className="text-xl font-semibold tracking-tight">Занятие с преподавателем</h2>
        <p className="mt-1 text-sm text-muted-foreground">Занимайтесь вместе с группой под руководством преподавателя.</p>
      </div>
      <button type="button" aria-label="Обновить текущее занятие" disabled={loading} onClick={onReload} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /></button>
    </div>
    <div className="px-4 pb-4" aria-busy={loading}>
      {error ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"><p>{error}</p><button type="button" className="mt-2 font-medium text-primary underline underline-offset-4" onClick={onReload}>Повторить загрузку</button></div>
      : !workspace ? <p role="status" className="py-5 text-sm text-muted-foreground">Проверяем текущее занятие…</p>
      : conflict ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed"><p className="font-semibold">Нужно уточнить текущее занятие</p><p className="mt-2 text-muted-foreground">В системе осталось несколько занятий с преподавателем. Обратитесь к преподавателю, чтобы завершить лишние. Сохранённые результаты доступны в истории.</p></div>
      : !lesson ? <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4"><p className="font-medium">Занятия сейчас нет</p><p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">Когда преподаватель начнёт занятие, оно появится здесь автоматически.</p></div>
      : <article className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{lesson.group_name ? `Занятие группы «${lesson.group_name}»` : "Групповое занятие ДДС"}</h3><span className="rounded-md bg-card px-2 py-1 text-xs font-medium text-primary">Занятие идёт</span></div>
        {lesson.teacher_name && <p className="mt-2 text-sm text-muted-foreground">Преподаватель: <span className="text-foreground">{lesson.teacher_name}</span></p>}
        <p className="mt-3 text-sm text-muted-foreground">Завершено карточек: {lesson.completed_cards} из {lesson.total_cards}</p>
        {lesson.session_status === "COMPLETED" && <p className="mt-3 text-sm text-muted-foreground">Ваша работа завершена. Дождитесь окончания занятия преподавателем.</p>}
        <Link className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={activityUrl(lesson)}>{lesson.session_status === "COMPLETED" ? "Посмотреть результат" : lesson.has_activity ? "Продолжить занятие" : "Присоединиться"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </article>}
    </div>
  </section>
}
