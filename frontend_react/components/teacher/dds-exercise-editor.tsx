"use client"
import {useEffect, useRef, useState} from "react"
import {apiFetch} from "@/lib/api-fetch"
import {getStoredToken} from "@/lib/auth-session"
const stages = ["Начало реагирования", "Прибытие", "Проведение работ", "Работы завершены"]
type Contact = {id: string; service_name: string; number: string; full_name: string; position: string; brigade: string; reply: string; dispatch_keywords: string[]; audio?: string | null}
type Report = {id: string; contact_id: string; status: string; text: string; comment_keywords: string[]; audio?: string | null}
type Plan = {version: 1; source: "prepared"; contacts: Contact[]; reports: Report[]}
export function DDSExerciseEditor({ticketId}: {ticketId: string}) {
  const [services, setServices] = useState<string[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [opened, setOpened] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const saving = useRef(false)
  const url = `/api/dds/tickets/${encodeURIComponent(ticketId)}/exercise`
  useEffect(() => {
    if (!opened) return
    const controller = new AbortController()
    apiFetch(url, {signal: controller.signal, headers: {Authorization: `Bearer ${getStoredToken()}`}})
      .then(async r => {if (!r.ok) throw new Error("План ДДС недоступен для этого билета"); return r.json()})
      .then(data => {
        if (!data || !Array.isArray(data.services) || data.services.some((name: unknown) => typeof name !== "string") || (data.plan != null && (!Array.isArray(data.plan.contacts) || !Array.isArray(data.plan.reports)))) throw new Error("Некорректные данные плана ДДС")
        if (!controller.signal.aborted) {setServices(data.services); setPlan(data.plan ?? null); setLoaded(true)}
      })
      .catch(e => {if (!controller.signal.aborted) {setMessage(e.message); setLoaded(true)}})
    return () => controller.abort()
  }, [url, opened])
  const create = () => {
    const contacts = services.map((service_name, i) => ({id: `contact-${i}`, service_name, number: `700${i}`,
      full_name: "Иванов Иван Иванович", position: "Мастер", brigade: `${i+1}`,
      reply: "Мастер Иванов Иван Иванович, слушаю. Готов принять задание.",
      dispatch_keywords: ["направлена"], audio: "/audio/tts/generic_reply.wav"}))
    setPlan({version: 1, source: "prepared", contacts, reports: contacts.flatMap((c, i) => stages.map((status, j) => ({
      id: `report-${i}-${j}`, contact_id: c.id, status,
      text: `${c.position} ${c.full_name}. Бригада ${c.brigade}: ${["выехала", "прибыла на место", "приступила к работам", "завершила работы, задача выполнена"][j]}.`,
      comment_keywords: j === 3 ? ["задача выполнена"] : [], audio: null,
    })))})
    setMessage("Подготовлен редактируемый шаблон. Проверьте сведения и результат под конкретную ситуацию, затем сохраните.")
  }
  const save = async () => {
    if (!plan || saving.current) return
    saving.current = true; setBusy(true); setMessage("")
    try {
      const r = await apiFetch(url, {method: "PUT", headers: {Authorization: `Bearer ${getStoredToken()}`, "Content-Type": "application/json"}, body: JSON.stringify(plan)})
      if (!r.ok) throw new Error(r.status === 422 ? "Проверьте номера, контакты и четыре этапа каждой службы. Итоговый доклад требует ключевых сведений результата." : "Не удалось сохранить план ДДС")
      const data = await r.json(); setPlan(data.plan)
      setMessage("План сохранён. Он применяется к новым занятиям; запущенные используют свой снимок.")
    } catch(e) {setMessage(e instanceof Error ? e.message : "Ошибка сохранения")}
    finally {saving.current = false; setBusy(false)}
  }
  const input = "w-full rounded border bg-background p-2 text-sm"
  const contactField = (index: number, key: keyof Contact, value: string | string[]) => setPlan(p => p && ({...p, contacts: p.contacts.map((c,i) => i === index ? {...c, [key]: value} : c)}))
  const reportField = (index: number, key: keyof Report, value: string | string[]) => setPlan(p => p && ({...p, reports: p.reports.map((r,i) => i === index ? {...r, [key]: value} : r)}))
  return <details className="rounded border p-3" aria-label="Настройка учебного цикла ДДС" onToggle={e => {if (e.currentTarget.open) setOpened(true)}}>
    <summary className="cursor-pointer font-semibold">Телефон и доклады ДДС</summary>
    <p className="my-2 text-sm">Подготовленные реплики, без генерации ИИ. Один обучаемый может отрабатывать несколько служб. До 10 номеров на ДДС.</p>
    {!loaded ? <p>Загрузка…</p> : !plan ? <><p>План докладов не включён.</p><button type="button" className="my-2 rounded border p-2" disabled={!services.length} onClick={create}>Подготовить план по службам билета</button></> : <div className="space-y-3">
      {plan.contacts.map((c, i) => <fieldset key={c.id} className="space-y-2 rounded border p-3" disabled={busy}><legend>{c.service_name}</legend>
        {([["number","Условный номер"],["full_name","ФИО исполнителя"],["position","Должность"],["brigade","Номер бригады"],["reply","Ответ на исходящий звонок"]] as const).map(([key,label]) => <label className="block text-xs" key={key}>{label}<input className={input} value={c[key]} onChange={e => contactField(i,key,e.target.value)}/></label>)}
        <label className="block text-xs">Ключевые сведения передаваемого задания (через ;)<input className={input} value={c.dispatch_keywords.join(";")} onChange={e => contactField(i,"dispatch_keywords",e.target.value.split(";"))}/></label>
        <label className="block text-xs">Готовый аудиофайл ответа, необязательно<input className={input} value={c.audio || ""} placeholder="/audio/tts/generic_reply.wav" onChange={e => setPlan(p => p && ({...p, contacts: p.contacts.map((v,j) => j === i ? {...v, audio: e.target.value || null} : v)}))}/></label>
      </fieldset>)}
      {services.map(service => <button key={service} type="button" disabled={busy || plan.contacts.filter(c => c.service_name === service).length >= 10} className="mr-2 rounded border p-2 text-xs" onClick={() => {
        const c = plan.contacts.find(c => c.service_name === service)!
        setPlan({...plan, contacts: [...plan.contacts, {...c, id: crypto.randomUUID(), number: "", full_name: "", reply: ""}]})
      }}>Добавить контакт: {service}</button>)}
      <p className="text-xs">Доклады поступают в указанном ниже порядке, по одному. Следующий — через 3 секунды после обработки предыдущего.</p>
      {plan.reports.map((r, i) => <fieldset key={r.id} className="space-y-2 rounded border p-3" disabled={busy}><legend>{i+1}. {r.status}</legend>
        <label className="block text-xs">Кто сообщает<select className={input} value={r.contact_id} onChange={e => reportField(i,"contact_id",e.target.value)}>{plan.contacts.filter(c => c.service_name === plan.contacts.find(c => c.id === r.contact_id)?.service_name).map(c => <option key={c.id} value={c.id}>{c.service_name} · {c.full_name} · {c.number}</option>)}</select></label>
        <label className="block text-xs">Текст доклада<textarea className={input} value={r.text} onChange={e => reportField(i,"text",e.target.value)}/></label>
        <label className="block text-xs">Ключевые сведения комментария (через ;)<input className={input} value={r.comment_keywords.join(";")} onChange={e => reportField(i,"comment_keywords",e.target.value ? e.target.value.split(";") : [])}/></label>
        <label className="block text-xs">Готовый аудиофайл доклада, необязательно<input className={input} value={r.audio || ""} onChange={e => setPlan(p => p && ({...p, reports: p.reports.map((v,j) => j === i ? {...v, audio: e.target.value || null} : v)}))}/></label>
      </fieldset>)}
      <p className="text-xs">Проверка записей: совпадение ФИО и должности, номера бригады и заданных ключевых сведений; без оценки свободной речи.</p>
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded bg-primary px-3 py-2 text-primary-foreground">{busy ? "Сохранение…" : "Сохранить план ДДС"}</button>
    </div>}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </details>
}
