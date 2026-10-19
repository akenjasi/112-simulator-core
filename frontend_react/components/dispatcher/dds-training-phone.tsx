"use client"
import {useEffect, useRef, useState} from "react"
import type {DDSExercise, DDSPhonePayload} from "@/lib/dds-cycle"

type Command = Omit<DDSPhonePayload, "request_id" | "card_id">
type PhoneRecord = {
  accepted: boolean; whoAccepted: string; setWhoAccepted: (value: string) => void;
  summary: string; setSummary: (value: string) => void;
  saved?: {whoAccepted: string; summary: string}; onSave: () => Promise<boolean>
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

export function DDSTrainingPhone({exercise, selectedService, onServiceChange, disabled, command, record}: {
  exercise: DDSExercise; selectedService: string; onServiceChange: (value: string) => void;
  disabled: boolean; command: (payload: Command) => Promise<boolean>; record?: PhoneRecord
}) {
  const [opened, setOpened] = useState(false)
  const [number, setNumber] = useState("")
  const [audioNotice, setAudioNotice] = useState("")
  const [view, setView] = useState<"call" | "directory" | "history">("call")
  const [directoryPage, setDirectoryPage] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const playbackEpoch = useRef(0)
  const incoming = exercise.incoming
  const outgoing = exercise.outgoing[selectedService]
  const received = exercise.events.filter(event => event.kind === "answered")
  const historyIndex = Math.min(historyPage, Math.max(0, received.length - 1))
  const historical = received[historyIndex]
  const lastAnswered = [...received].reverse().find(event => event.report_id === incoming?.id)
  const message = incoming?.text || outgoing?.text
  const hasReport = !!incoming?.text
  const recordDisabled = disabled || !record?.accepted || !outgoing || !!record?.saved

  useEffect(() => () => {playbackEpoch.current++; audio.current?.pause()}, [])
  useEffect(() => {
    // Preserve drafts during server polling; reset only when the operator changes service.
    record?.setWhoAccepted(""); record?.setSummary("")
    setNumber(""); setAudioNotice("")
    playbackEpoch.current++; audio.current?.pause()
  }, [selectedService])
  useEffect(() => {
    if (record?.saved) {
      record.setWhoAccepted(record.saved.whoAccepted); record.setSummary(record.saved.summary)
    }
  }, [selectedService, record?.saved?.whoAccepted, record?.saved?.summary])

  const play = (path: string | null | undefined, callId?: string) => {
    playbackEpoch.current++; const epoch = playbackEpoch.current
    audio.current?.pause()
    if (!path || !callId) {setAudioNotice("Для сообщения доступен текст."); return}
    const player = new Audio(path); audio.current = player
    let settled = false
    const done = (result: "played" | "unavailable") => {
      if (settled || playbackEpoch.current !== epoch) return
      settled = true
      setAudioNotice(result === "played" ? "Реплика воспроизведена." : "Аудио недоступно. Используйте текст сообщения.")
      void command({operation: "audio", call_id: callId, audio_result: result})
    }
    player.onended = () => done("played"); player.onerror = () => done("unavailable")
    player.play().catch(() => done("unavailable"))
  }

  return <section className="min-h-0 text-sm text-[#1e2327]" aria-label="Телефон ДДС">
    <div className="flex items-center gap-3">
      <button type="button" aria-expanded={opened} className="rounded bg-green-700 px-3 py-2 font-semibold text-white" onClick={() => setOpened(value => !value)}>☎ Телефон</button>
      {incoming?.ringing && <div role="status" className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded border border-[#b4b9bc] bg-[#fbfdfe] px-3 py-2">
        <span className="truncate">Входящий: {incoming.contact.service_name} · {incoming.contact.full_name}</span>
        <button type="button" disabled={disabled} className="shrink-0 rounded bg-green-700 px-3 py-1 text-white disabled:opacity-50"
          onClick={() => {setOpened(true); setView("call"); void command({operation: "answer", report_id: incoming.id})}}>Принять звонок</button>
      </div>}
    </div>
    {opened && <div className="mt-2 border border-[#b4b9bc] bg-[#fbfdfe] p-3">
      {view === "directory" ? <div aria-label="Справочник телефонов">
        <div className="mb-3 flex items-center justify-between"><strong>Справочник</strong><button type="button" onClick={() => setView("call")}>Назад к телефону</button></div>
        <ul className="space-y-2">{exercise.contacts.slice(directoryPage * 4, directoryPage * 4 + 4).map(contact => <li key={contact.id}>
          <button type="button" disabled={disabled} className="underline" onClick={() => {setNumber(contact.number); setView("call")}}>{contact.number}</button> · {contact.service_name} · {contact.position} {contact.full_name} · бригада {contact.brigade}
        </li>)}</ul>
        {exercise.contacts.length > 4 && <div className="mt-3 flex justify-between">
          <button type="button" disabled={directoryPage === 0} onClick={() => setDirectoryPage(value => value - 1)}>Предыдущие контакты</button>
          <button type="button" disabled={(directoryPage + 1) * 4 >= exercise.contacts.length} onClick={() => setDirectoryPage(value => value + 1)}>Следующие контакты</button>
        </div>}
      </div> : view === "history" ? <div aria-label="Полученные сообщения">
        <div className="mb-3 flex items-center justify-between"><strong>Полученные сообщения</strong><button type="button" onClick={() => setView("call")}>Назад к телефону</button></div>
        {historical ? <><p className="mb-2 font-medium">{historical.service_name}</p><MessageText text={historical.text || ""}/>
          <button type="button" className="mt-2 underline" disabled={disabled} onClick={() => play(historical.audio, historical.id)}>Прослушать сообщение</button>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" disabled={historyIndex === 0} onClick={() => setHistoryPage(historyIndex - 1)}>Предыдущее сообщение</button>
            <span>{historyIndex + 1} / {received.length}</span>
            <button type="button" disabled={historyIndex === received.length - 1} onClick={() => setHistoryPage(historyIndex + 1)}>Следующее сообщение</button>
          </div></> : <p>Принятых сообщений пока нет.</p>}
      </div> : <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">Служба
            <select aria-label="Служба телефона" value={selectedService} disabled={disabled} onChange={event => onServiceChange(event.target.value)} className="min-w-0 flex-1 border border-[#b4b9bc] bg-white p-1.5">
              {[...new Set(exercise.contacts.map(contact => contact.service_name))].map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
          <button type="button" className="shrink-0 border border-[#b4b9bc] px-3 py-1.5" onClick={() => setView("directory")}>Справочник</button>
          <button type="button" className="shrink-0 border border-[#b4b9bc] px-3 py-1.5" onClick={() => {setHistoryPage(Math.max(0, received.length - 1)); setView("history")}}>Сообщения</button>
        </div>
        <div className="flex gap-2">
          <input aria-label="Номер учебного телефона" placeholder="Номер телефона" value={number} maxLength={24} disabled={disabled} onChange={event => setNumber(event.target.value)} className="min-w-0 flex-1 border border-[#b4b9bc] p-1.5"/>
          <button type="button" disabled={disabled || !number.trim()} className="bg-green-700 px-4 text-white disabled:opacity-50" onClick={() => void command({operation: "dial", number: number.trim(), service_name: selectedService})}>Набрать</button>
        </div>
        {message && <div className="border border-[#b4b9bc] bg-[#efefef] p-2">
          <span className="text-xs font-semibold">{hasReport ? `Принятый доклад · ${incoming!.contact.service_name}` : `Ответ · ${selectedService}`}</span>
          <MessageText text={message}/>
          <button type="button" disabled={disabled} className="mt-1 text-xs underline" onClick={() => play(hasReport ? incoming?.audio : outgoing?.audio, hasReport ? lastAnswered?.id : outgoing?.call_id)}>{hasReport ? "Прослушать доклад" : "Прослушать ответ"}</button>
        </div>}
        {record && <div className="space-y-2 border-t border-[#b4b9bc] pt-2">
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Кто принял:</span><input aria-label="Кто принял" disabled={recordDisabled} value={record.saved?.whoAccepted ?? record.whoAccepted} onChange={event => record.setWhoAccepted(event.target.value)} placeholder="ФИО, должность" className="min-w-0 flex-1 border border-[#b4b9bc] p-1.5"/></label>
          <label className="flex items-center gap-2"><span className="w-24 shrink-0">Суть:</span><input aria-label="Суть сообщения" disabled={recordDisabled} value={record.saved?.summary ?? record.summary} onChange={event => record.setSummary(event.target.value)} placeholder="Переданное поручение" className="min-w-0 flex-1 border border-[#b4b9bc] p-1.5"/></label>
          <div className="flex justify-end"><button type="button" disabled={recordDisabled || !record.whoAccepted.trim() || !record.summary.trim()} onClick={() => void record.onSave()} className="bg-[#157dbd] px-3 py-1.5 text-white disabled:opacity-50">{record.saved ? "Сохранено" : "Сохранить телефонограмму"}</button></div>
        </div>}
      </div>}
      {audioNotice && <p role="status" className="mt-2 text-xs">{audioNotice}</p>}
    </div>}
  </section>
}
