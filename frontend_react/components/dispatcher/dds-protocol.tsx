"use client"
import type {DDSCriterion, DDSEvent} from "@/lib/dds-cycle"
const labels = {completed: "Выполнено", completed_after_correction: "Выполнено после исправления", not_completed: "Не выполнено", not_evaluated: "Не оценено"}
const recommendations: Record<string, string> = {
  confirmation: "Подтверждайте получение карточки каждой службой в течение 30 секунд от направления.",
  service: "Перед сохранением сверяйте службу доклада и выбранную службу карточки.",
  stage: "Устанавливайте статус только по принятому докладу, соответствующему этому этапу.",
  accuracy: "Сверяйте исполнителя, номер бригады и существенные сведения сообщения.",
  completion: "Завершайте обработку после итогового доклада и записи результата работ.",
}
export function DDSProtocol({criteria = [], events = []}: {criteria?: DDSCriterion[]; events?: DDSEvent[]}) {
  const mistakes = events.filter(event => event.kind === "mistake")
  return <details className="rounded border border-slate-400 bg-white p-3 text-sm text-slate-900" open={false}>
    <summary className="cursor-pointer font-semibold">Протокол ДДС · Ошибочных попыток: {mistakes.length}</summary>
    <p className="my-2 text-xs">Критерии без баллов. Интервалы обработки докладов сохраняются без штрафов.</p>
    <ul className="space-y-1">{criteria.map(c => <li key={c.key}>{c.label}: <strong>{labels[c.status]}</strong>
      {c.key === "confirmation" && c.evidence.map((e, i) => <span className="block text-xs" key={i}>{String(e.service_name)}: {e.seconds == null ? "не подтверждено" : `${Number(e.seconds).toFixed(1)} с`}</span>)}
    </li>)}</ul>
    {criteria.some(c => c.status === "not_completed" || c.status === "completed_after_correction") && <div className="mt-3 border-t pt-2">
      <strong>Рекомендации по критериям</strong><ul>{criteria.filter(c => c.status === "not_completed" || c.status === "completed_after_correction").map(c => <li key={c.key}>{recommendations[c.key]}</li>)}</ul>
    </div>}
    {events.length > 0 && <ol className="mt-3 max-h-52 space-y-2 overflow-y-auto border-t pt-2" aria-label="Журнал учебных событий">
      {events.map(e => <li key={e.id} className={e.kind === "mistake" ? "text-red-800" : ""}>
        <time>{new Date(e.at).toLocaleTimeString("ru-RU")}</time> · {e.service_name} · {e.message || e.text || ({received: "Карточка направлена", action: "Действие сохранено", incoming_scheduled: "Запланирован входящий доклад", report_processed: "Доклад обработан", audio: e.result === "played" ? "Аудио воспроизведено (подтверждение браузера)" : "Аудио недоступно"} as Record<string, string>)[e.kind] || e.kind}
        {e.action && <span className="block text-xs">{String(e.action.status || e.action.operation || e.action.kind || "")}</span>}
        {e.delay_seconds !== undefined && <span className="block text-xs">Регистрация доклада: {e.delay_seconds.toFixed(1)} с · без штрафа</span>}
      </li>)}
    </ol>}
  </details>
}
