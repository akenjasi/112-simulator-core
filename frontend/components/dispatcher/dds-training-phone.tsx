"use client"
import {useEffect, useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent, type Dispatch, type SetStateAction} from "react"
import {createPortal} from "react-dom"
import {GripHorizontal, Minus, Phone, PhoneIncoming, Volume2, VolumeX} from "lucide-react"
import type {DDSHelpTopic} from "@/lib/dds-interface-help"
import type {DDSExercise, DDSPhonePayload} from "@/lib/dds-cycle"

type Command = Omit<DDSPhonePayload, "request_id" | "card_id">
type PhoneRecord = {
  accepted: boolean; whoAccepted: string; setWhoAccepted: (value: string) => void;
  summary: string; setSummary: (value: string) => void;
  saved?: {whoAccepted: string; summary: string}; onSave: (summary: string) => Promise<boolean>
}

// Long scenario messages are paged inside the telephone, without moving the AРМ.
function MessageText({text}: {text: string}) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [text])
  const pages = text.match(/[\s\S]{1,420}/g) || [""]
  const index = Math.min(page, pages.length - 1)
  return <div>
    <p className="whitespace-pre-wrap break-words">{pages[index]}</p>
    {pages.length > 1 && <div className="mt-1 flex items-center justify-end gap-3 text-xs">
      <button type="button" disabled={index === 0} onClick={() => setPage(index - 1)}>Предыдущая часть</button>
      <span>{index + 1} / {pages.length}</span>
      <button type="button" disabled={index === pages.length - 1} onClick={() => setPage(index + 1)}>Следующая часть</button>
    </div>}
  </div>
}

type ReportFields = {who: string; brigade: string; content: string}
const emptyReport = (): ReportFields => ({who: "", brigade: "", content: ""})
const summaryText = (brigade: string, content: string) => brigade.trim()
  ? `Номер бригады: ${brigade.trim()}\nСодержание доклада: ${content.trim()}` : content.trim()
const reportText = (fields: ReportFields) => `Кто доложил: ${fields.who.trim()}\n${summaryText(fields.brigade, fields.content)}`
function readSummary(text: string) {
  const match = /^Номер бригады: ([^\n]*)\nСодержание доклада: ([\s\S]*)$/.exec(text)
  return match ? {brigade: match[1], content: match[2]} : {brigade: "", content: text}
}
function readReport(text: string): ReportFields {
  const match = /^Кто доложил: ([^\n]*)\n([\s\S]*)$/.exec(text)
  // Old free-form records remain intact; never infer a caller's identity from a transcript.
  return match ? {who: match[1], ...readSummary(match[2])} : {...emptyReport(), content: text}
}

function ReportForm({fields, onChange, disabled, saved, saveDisabled, onSave, first, legacy}: {
  fields: ReportFields; onChange: (fields: ReportFields) => void; disabled: boolean; saved: boolean;
  saveDisabled: boolean; onSave: () => void; first: boolean; legacy: boolean
}) {
  const input = "mt-1 min-h-10 w-full rounded border border-[#b4b9bc] bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-600"
  const tooLong = (first ? summaryText(fields.brigade, fields.content) : reportText(fields)).length > 1000
  return <div data-dds-help="record" className="space-y-3" aria-label="Запись доклада">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <label className="block text-xs font-medium">{legacy && first ? "Кто принял" : "Кто доложил"}
        <input aria-label={legacy && first ? "Кто принял" : "Кто доложил"} disabled={disabled} maxLength={255}
          value={fields.who} onChange={event => onChange({...fields, who: event.target.value})} placeholder="ФИО и должность" className={input}/>
      </label>
      <label className="block text-xs font-medium">Номер бригады
        <input aria-label="Номер бригады в докладе" disabled={disabled} maxLength={64}
          value={fields.brigade} onChange={event => onChange({...fields, brigade: event.target.value})} placeholder="По услышанному" className={input}/>
      </label>
    </div>
    <label className="block text-xs font-medium">Содержание доклада
      <textarea aria-label={legacy && first ? "Суть сообщения" : "Содержание доклада"} rows={3} maxLength={900} disabled={disabled}
        value={fields.content} onChange={event => onChange({...fields, content: event.target.value})}
        placeholder="Этап и фактические действия бригады — по услышанному" className={`${input} min-h-24 resize-y`}/>
    </label>
    {tooLong && <p role="alert" className="text-xs text-red-700">Сократите запись до 1000 символов с учётом подписей полей.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{saved ? "Запись сохранена" : "Запишите сведения из доклада"}</span>
      <button type="button" disabled={saveDisabled} onClick={onSave}
        className="min-h-10 rounded bg-[#157dbd] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {first ? saved ? "Сохранено" : "Сохранить телефонограмму" : saved ? "Доклад записан" : "Сохранить запись доклада"}
      </button>
    </div>
  </div>
}

// Non-modal: the operator can still use the service status bar while this window is open.
type WindowPosition = {x: number; y: number} | null
function PhoneWindow({children, onMinimize, position, setPosition}: {
  children: ReactNode; onMinimize: () => void; position: WindowPosition; setPosition: Dispatch<SetStateAction<WindowPosition>>
}) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{id: number; x: number; y: number; left: number; top: number} | null>(null)
  const constrain = (x: number, y: number) => {
    const bounds = panel.current?.getBoundingClientRect()
    return {x: Math.max(12, Math.min(x, window.innerWidth - (bounds?.width || 880) - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - (bounds?.height || 430) - 12))}
  }
  useEffect(() => {
    const resize = () => setPosition(previous => previous ? constrain(previous.x, previous.y)
      : constrain((window.innerWidth - (panel.current?.offsetWidth || 880)) / 2,
        window.innerHeight - (panel.current?.offsetHeight || 430) - 160))
    resize(); window.addEventListener("resize", resize)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
    if (panel.current) observer?.observe(panel.current)
    return () => {window.removeEventListener("resize", resize); observer?.disconnect()}
  }, [])
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const bounds = panel.current!.getBoundingClientRect()
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top}
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (start?.id === event.pointerId) setPosition(constrain(start.left + event.clientX - start.x, start.top + event.clientY - start.y))
  }
  const moveWithKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta: Record<string, [number, number]> = {ArrowLeft: [-20,0], ArrowRight: [20,0], ArrowUp: [0,-20], ArrowDown: [0,20]}
    if (!delta[event.key]) return
    event.preventDefault()
    const bounds = panel.current!.getBoundingClientRect(), [x,y] = delta[event.key]
    setPosition(constrain(bounds.left + x, bounds.top + y))
  }
  return createPortal(<div data-dds-help="phone-window" ref={panel} role="dialog" aria-label="Учебный телефон ДДС" aria-modal={false}
    onKeyDown={event => {if (event.key === "Escape") {event.stopPropagation(); onMinimize()}}}
    className="fixed z-[70] flex w-[880px] max-w-[calc(100vw-24px)] select-text flex-col overflow-hidden rounded-xl border border-slate-300 bg-[#fbfdfe] text-sm text-[#1e2327] shadow-2xl"
    style={{left: position?.x ?? 12, top: position?.y ?? 12, maxHeight: "calc(100dvh - 120px)", visibility: position ? "visible" : "hidden"}}>
    <div className="flex shrink-0 items-center gap-2 bg-[#2b3a42] px-3 py-2 text-white">
      <button type="button" aria-label="Переместить окно телефона" title="Перетащите окно или используйте клавиши со стрелками"
        className="flex min-h-9 min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded px-1 text-left focus-visible:outline-2 active:cursor-grabbing"
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => {drag.current = null}}
        onPointerCancel={() => {drag.current = null}} onKeyDown={moveWithKeys}>
        <GripHorizontal size={18} className="text-slate-400"/><Phone size={17} className="text-green-400"/>
        <span className="font-semibold">Телефон ДДС</span><span className="ml-auto hidden text-xs text-slate-300 sm:inline">Перетащите за заголовок</span>
      </button>
      <button type="button" aria-label="Свернуть телефон" title="Свернуть (Esc)" onClick={onMinimize} className="rounded p-2 hover:bg-slate-600"><Minus size={20}/></button>
    </div>
    <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
  </div>, document.body)
}

// A local alert, separate from the report recordings; it never sends phone commands.
function useIncomingRingtone(ringing: boolean, enabled = true) {
  const context = useRef<AudioContext | null>(null)
  const active = useRef<{osc: OscillatorNode; gain: GainNode}[]>([])
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)
  const mounted = useRef(false)
  const stop = () => {
    active.current.forEach(({osc, gain}) => {try {osc.stop()} catch { /* Already stopped. */ } osc.disconnect(); gain.disconnect()})
    active.current = []
  }
  const unlock = () => {
    try {
      const AudioCtx = window.AudioContext || (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext
      if (!AudioCtx) return
      const ctx = context.current || new AudioCtx(); context.current = ctx
      const resumed = () => {if (mounted.current) setReady(ctx.state === "running")}
      if (ctx.state === "suspended") void ctx.resume().then(resumed).catch(() => {if (mounted.current) setReady(false)})
      else resumed()
    } catch {if (mounted.current) setReady(false)}
  }
  useEffect(() => {
    if (!enabled) return
    mounted.current = true
    window.addEventListener("pointerdown", unlock, true); window.addEventListener("keydown", unlock, true)
    return () => {
      mounted.current = false; stop()
      window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true)
      void context.current?.close().catch(() => {}); context.current = null
    }
  }, [enabled])
  useEffect(() => {
    if (!enabled || !ringing || muted || !ready || !context.current) return
    const ctx = context.current
    const pulse = () => {
      if (ctx.state !== "running") {setReady(false); return}
      stop()
      for (const delay of [0, .55]) for (const frequency of [440, 480]) {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + delay
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .02)
        gain.gain.setValueAtTime(.035, start + .28); gain.gain.linearRampToValueAtTime(0, start + .33)
        osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + .35)
        active.current.push({osc, gain})
      }
    }
    pulse(); const timer = window.setInterval(pulse, 3000)
    return () => {window.clearInterval(timer); stop()}
  }, [ringing, muted, ready, enabled])
  return {muted, ready, toggle: () => {unlock(); setMuted(value => !value)}, enable: () => {setMuted(false); unlock()}}
}

export function DDSTrainingPhone({exercise, selectedService, onServiceChange, disabled, command, record, tourTopic, silent = false}: {
  exercise: DDSExercise; selectedService: string; onServiceChange: (value: string) => void;
  disabled: boolean; command: (payload: Command) => Promise<boolean>; record?: PhoneRecord; tourTopic?: DDSHelpTopic | null; silent?: boolean
}) {
  const [opened, setOpened] = useState(false)
  const touring = tourTopic !== undefined
  const phoneVisible = touring ? ["phoneWindow", "directory", "dial", "sound", "record"].includes(tourTopic || "") : opened
  const [position, setPosition] = useState<WindowPosition>(null)
  const [number, setNumber] = useState("")
  const [audioNotice, setAudioNotice] = useState("")
  const [playing, setPlaying] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const [view, setView] = useState<"call" | "directory">("call")
  const visibleView = touring ? tourTopic === "directory" ? "directory" : "call" : view
  const [directoryPage, setDirectoryPage] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, ReportFields>>({})
  const [brigades, setBrigades] = useState<Record<string, string>>({})
  const departureDrafts = useRef<Record<string, {who: string; content: string}>>({})
  const launcher = useRef<HTMLButtonElement>(null)
  const shownIncoming = useRef<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const playbackEpoch = useRef(0)
  const autoPlay = useRef<{operation: "dial" | "answer"; previous?: string; report?: string; service?: string} | null>(null)
  const commandRef = useRef(command)
  commandRef.current = command
  const sequential = exercise.version === 2
  const audioOnly = exercise.presentation === "audio_only"
  const incoming = exercise.incoming
  const outgoing = exercise.outgoing[selectedService]
  const received = exercise.events.filter(event => event.kind === "answered" || sequential && event.kind === "dialed" && !!event.report_id)
  const latestCall = [...exercise.events].reverse().find(event => event.kind === "answered" || event.kind === "dialed")
  const lastAnswered = incoming ? [...received].reverse().find(event => event.report_id === incoming.id) : undefined
  const hasReport = incoming?.direction !== "outgoing" && !incoming?.ringing && (!!lastAnswered || !!incoming?.text)
  const savedNote = incoming ? exercise.notes?.[incoming.id] || "" : ""
  const fields = incoming ? drafts[incoming.id] ?? readReport(savedNote) : emptyReport()
  const savedSummary = readSummary(record?.saved?.summary || "")
  const departureFields = {who: record?.saved?.whoAccepted ?? record?.whoAccepted ?? "",
    brigade: record?.saved ? savedSummary.brigade : brigades[selectedService] || "",
    content: record?.saved ? savedSummary.content : record?.summary || ""}
  const recordDisabled = disabled || (sequential && incoming?.contact.service_name !== selectedService) || !record?.accepted || !outgoing || !!record?.saved
  const ringing = !!incoming?.ringing
  const ring = useIncomingRingtone(ringing && answering !== incoming?.id && !playing && !touring, !silent)
  const currentService = hasReport ? incoming!.contact.service_name : selectedService
  const currentContact = hasReport ? incoming!.contact : exercise.contacts.find(contact => outgoing
    ? contact.id === outgoing.contact_id : contact.service_name === selectedService)
  const noteValue = reportText(fields)
  const noteUnchanged = !incoming || !Object.hasOwn(drafts, incoming.id) || noteValue === savedNote
  const fieldReady = (value: ReportFields) => !!(value.who.trim() && value.brigade.trim() && value.content.trim())

  useEffect(() => () => {playbackEpoch.current++; audio.current?.pause()}, [])
  useEffect(() => {
    // Preserve drafts during polling and window minimization.
    record?.setWhoAccepted(departureDrafts.current[selectedService]?.who || "")
    record?.setSummary(departureDrafts.current[selectedService]?.content || "")
    setAudioNotice(""); setPlaying(false)
    playbackEpoch.current++; audio.current?.pause()
  }, [selectedService])
  useEffect(() => {
    if (record?.saved) {
      record.setWhoAccepted(record.saved.whoAccepted); record.setSummary(savedSummary.content)
    }
  }, [selectedService, record?.saved?.whoAccepted, record?.saved?.summary])
  useEffect(() => {
    if (!incoming?.ringing || shownIncoming.current === incoming.id) return
    shownIncoming.current = incoming.id
    setOpened(true); setView("call")
    // An arriving call never changes the selected service or accepts itself.
  }, [incoming?.id, incoming?.ringing])
  useEffect(() => {
    // Restore the connected service from the server, including after a network retry.
    if (latestCall?.service_name) onServiceChange(latestCall.service_name)
  }, [latestCall?.id, latestCall?.service_name])

  const play = (path: string | null | undefined, callId?: string) => {
    playbackEpoch.current++; const epoch = playbackEpoch.current
    audio.current?.pause(); setPlaying(false)
    if (!path || !callId) {setAudioNotice(audioOnly ? "Запись недоступна. Сообщите преподавателю." : "Для сообщения доступен текст."); return}
    // Existing lesson snapshots keep their URLs; bypass pre-Qwen browser caches.
    const playbackPath = /^\/api\/dds\/audio\/dds_(ivanov|petrov|sidorov|smirnov)_cycle2_[0-3]\.wav$/.test(path)
      ? `${path}?v=qwen-aidar-phone-v1` : path
    const player = new Audio(playbackPath); audio.current = player
    let settled = false
    const done = (result: "played" | "unavailable") => {
      if (settled || playbackEpoch.current !== epoch) return
      settled = true; setPlaying(false)
      setAudioNotice(result === "played" ? "Реплика воспроизведена." : audioOnly ? "Аудио недоступно. Повторите прослушивание или сообщите преподавателю." : "Аудио недоступно. Используйте текст сообщения.")
      void commandRef.current({operation: "audio", call_id: callId, audio_result: result})
    }
    player.onended = () => done("played"); player.onerror = () => done("unavailable")
    setPlaying(true); setAudioNotice("Воспроизведение записи…")
    player.play().catch(() => done("unavailable"))
  }

  // Only an explicit successful call arms autoplay. Polling, replay and reload do not.
  useEffect(() => {
    const intent = autoPlay.current
    if (!intent || disabled || intent.operation === "dial" && intent.service !== selectedService) return
    const callId = intent.operation === "answer" ? lastAnswered?.id : outgoing?.call_id
    if (!callId || (intent.operation === "answer" ? intent.report !== incoming?.id : callId === intent.previous)) return
    autoPlay.current = null
    play(intent.operation === "answer" ? incoming?.audio : outgoing?.audio, callId)
  }, [disabled, lastAnswered?.id, outgoing?.call_id, incoming?.id, selectedService])

  const call = async (payload: Command) => {
    autoPlay.current = payload.operation === "answer" ? {operation: "answer", report: payload.report_id}
      : {operation: "dial", service: payload.service_name, previous: exercise.outgoing[payload.service_name || ""]?.call_id}
    if (payload.operation === "answer") setAnswering(payload.report_id || null)
    try {
      const accepted = await command(payload)
      if (!accepted) autoPlay.current = null
      return accepted
    }
    finally {setAnswering(null)}
  }
  const dial = async () => {
    const dialedNumber = number.trim()
    if (disabled || !dialedNumber) return
    const contact = exercise.contacts.find(contact => contact.number === dialedNumber)
    const service = contact?.service_name || selectedService
    if (await call({operation: "dial", number: dialedNumber, service_name: service}) && contact) onServiceChange(service)
  }
  const minimize = () => {setOpened(false); launcher.current?.focus()}
  const answerButton = <button type="button" disabled={disabled || answering === incoming?.id}
    className="min-h-10 shrink-0 rounded bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
    onClick={() => {setOpened(true); setView("call"); onServiceChange(incoming!.contact.service_name); void call({operation:"answer", report_id:incoming!.id})}}>Принять звонок</button>
  const button = "min-h-9 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"

  return <section data-dds-help="phone" className="min-h-0 text-sm text-[#1e2327]" aria-label="Телефон ДДС">
    <div className="flex flex-wrap items-center gap-3">
      <button ref={launcher} type="button" aria-expanded={phoneVisible} className="rounded bg-green-700 px-3 py-2 font-semibold text-white"
        onClick={() => setOpened(value => !value)}>☎ Телефон</button>
      {ringing && !phoneVisible && <div role="status" className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded border border-green-500 bg-green-50 px-3 py-2">
        <span>Входящий: {incoming!.contact.service_name}</span>{answerButton}
      </div>}
    </div>
    {phoneVisible && <PhoneWindow onMinimize={minimize} position={position} setPosition={setPosition}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div data-dds-help="directory" className="flex items-center gap-2">
          <button type="button" aria-pressed={visibleView === "call"} className={button} onClick={() => setView("call")}>Телефон</button>
          <button type="button" aria-pressed={visibleView === "directory"} className={button} onClick={() => setView("directory")}>Справочник</button>
        </div>
        <div data-dds-help="sound" className="flex items-center gap-1">
        <button type="button" disabled={disabled} aria-label="Звук входящего звонка" aria-pressed={!ring.muted} onClick={ring.toggle}
          className="flex min-h-9 items-center gap-2 rounded px-2 text-xs text-slate-600 hover:bg-slate-100">
          {ring.muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}{ring.muted ? "Звонок без звука" : "Звук звонка"}
        </button></div>
      </div>
      {ringing && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-400 bg-green-50 p-3">
        <div className="flex items-center gap-3"><PhoneIncoming size={22} className="text-green-700"/>
          <div><p className="font-semibold">Входящий: {incoming!.contact.service_name}</p>
            <p className="mt-0.5 font-mono text-sm text-slate-600">{incoming!.contact.number}</p></div>
        </div>{answerButton}
        {!ring.ready && !ring.muted && <button type="button" className="w-full text-left text-xs underline" onClick={ring.enable}>Включить звук звонка</button>}
      </div>}
      {visibleView === "directory" ? <div aria-label="Справочник телефонов">
        <h3 className="mb-3 font-semibold">Учебные номера служб</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{exercise.contacts.slice(directoryPage*4, directoryPage*4+4).map(contact => <li key={contact.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="min-w-0"><p className="font-medium">{contact.service_name}</p>
            {!audioOnly && <p className="text-xs text-slate-500">{contact.position} {contact.full_name} · бригада {contact.brigade}</p>}</div>
          <button type="button" disabled={disabled} title="Подставить номер для набора" className="rounded bg-green-50 px-3 py-2 font-mono text-lg font-semibold text-green-800 disabled:opacity-50"
            onClick={() => {setNumber(contact.number); setView("call")}}>{contact.number}</button>
        </li>)}</ul>
        <p className="mt-3 text-xs text-slate-500">Подставьте номер для набора или запомните его и введите вручную.</p>
        {exercise.contacts.length > 4 && <div className="mt-3 flex justify-between">
          <button type="button" className={button} disabled={directoryPage===0} onClick={() => setDirectoryPage(value=>value-1)}>Предыдущие контакты</button>
          <button type="button" className={button} disabled={(directoryPage+1)*4>=exercise.contacts.length} onClick={() => setDirectoryPage(value=>value+1)}>Следующие контакты</button>
        </div>}
      </div> : <div className="grid grid-cols-1 gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        <div data-dds-help="dial" className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-xs font-medium">Набор номера</span></div>
          <label className="block text-xs font-medium">Номер телефона
            <input aria-label="Номер учебного телефона" placeholder="Введите номер" value={number} maxLength={24} disabled={disabled}
              onChange={event=>setNumber(event.target.value)} onKeyDown={event=>{if(event.key==="Enter") void dial()}}
              className="mt-1 min-h-12 w-full rounded border border-[#b4b9bc] bg-white px-3 py-2 font-mono text-2xl tracking-wider"/>
          </label>
          <button type="button" disabled={disabled || !number.trim()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            onClick={dial}><Phone size={16}/>Набрать</button>
          <p className="text-xs leading-relaxed text-slate-500">Найдите номер службы в справочнике и наберите его. После доклада сохраните запись и отметьте этап в нижнем блоке службы.</p>
        </div>
        <div className="min-w-0 space-y-3 border-t border-slate-200 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold">{hasReport ? "Принятый доклад" : sequential && outgoing ? "Доклад о выезде" : "Телефонограмма"}</h3>
              <p className="text-xs text-slate-500">{hasReport || outgoing ? `${currentService}${currentContact ? ` · ${currentContact.number}` : ""}` : "Сначала наберите номер службы"}</p></div>
            {(hasReport || outgoing) && <button type="button" disabled={disabled} className={button}
              onClick={()=>play(hasReport ? incoming?.audio : outgoing?.audio, hasReport ? lastAnswered?.id : outgoing?.call_id)}>
              {hasReport || sequential ? "Прослушать доклад" : "Прослушать ответ"}</button>}
          </div>
          {!audioOnly && (hasReport || outgoing) && <div className="rounded bg-slate-100 p-3 text-sm"><MessageText text={(hasReport ? incoming?.text : outgoing?.text) || ""}/></div>}
          {hasReport ? <ReportForm fields={fields} onChange={next=>setDrafts(previous=>({...previous,[incoming!.id]:next}))}
            disabled={disabled} saved={!!savedNote && noteUnchanged} first={false} legacy={!sequential}
            saveDisabled={disabled || !fieldReady(fields) || noteValue.length>1000 || (!!savedNote && noteUnchanged)}
            onSave={()=>void command({operation:"note",report_id:incoming!.id,note:noteValue})}/>
            : record ? <ReportForm fields={departureFields} onChange={next=>{
              departureDrafts.current[selectedService] = {who: next.who, content: next.content}
              record.setWhoAccepted(next.who); record.setSummary(next.content)
              setBrigades(previous=>({...previous,[selectedService]:next.brigade}))}}
              disabled={recordDisabled} saved={!!record.saved} first legacy={!sequential}
              saveDisabled={recordDisabled || !departureFields.who.trim() || !departureFields.content.trim() || (sequential && !departureFields.brigade.trim()) || summaryText(departureFields.brigade,departureFields.content).length>1000}
              onSave={()=>void record.onSave(summaryText(departureFields.brigade,departureFields.content))}/>
            : <p className="py-6 text-sm text-slate-500">Наберите номер службы или примите входящий звонок.</p>}
          {audioNotice && <p role="status" className="text-xs text-slate-600">{audioNotice}</p>}
        </div>
      </div>}
    </PhoneWindow>}
  </section>
}
