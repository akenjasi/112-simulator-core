"use client"

import {useEffect, useRef, useState} from "react"
import Link from "next/link"
import type {DispatcherData} from "@/lib/dispatcher-data"
import type {DDSContact, DDSExercise} from "@/lib/dds-cycle"
import type {DDSHelpTopic} from "@/lib/dds-interface-help"
import {Tutorial} from "@/components/tutorial"
import {DDSWorkspaceContent} from "./dds-workspace-content"
import {DDSTrainingPhone} from "./dds-training-phone"
import {ServicesBar} from "./services-bar"

// An isolated presentation fixture, not an Assignment/ExamSession or a ticket.
const contact: DDSContact = {id: "guide-contact", service_name: "Учебная аварийная служба", number: "0000",
  full_name: "Учебный дежурный", position: "Диспетчер", brigade: "Учебный наряд"}
const card: DispatcherData = {
  connection: "Учебный пример · без подключения",
  phones: {aon: "Учебный номер", provided: "Учебный номер", onSite: "—"},
  incident: {number: "Пример ДДС-001", savedAt: "Учебный пример", operator: "Учебный оператор 112"},
  caller: {name: "Учебный заявитель", role: "очевидец", address: "Учебный адрес: двор, участок № 1"},
  description: "Учебный пример: во дворе упало дерево. Люди не пострадали. Аварийной службе передано поручение осмотреть участок.",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "Городское хозяйство", title: "Падение дерева", class: "Дерево во дворе", visClass: "Учебный пример"},
  services: [{id: "guide-service", name: contact.service_name, status: "Принята", time: "Учебное время", orderNumber: "УЧ-001",
    history: [{op: "Учебный диспетчер", time: "Учебное время", status: "Принята", orderNumber: "УЧ-001", comment: "Пример сохранённого действия"}]}],
}
const exercise: DDSExercise = {
  version: 2, presentation: "audio_only", source: "prepared", contacts: [contact],
  incoming: {id: "guide-report", contact, ringing: false, direction: "outgoing", text: "Учебный доклад: наряд осматривает участок. Пострадавших нет.", audio: null},
  outgoing: {[contact.service_name]: {contact_id: contact.id, call_id: "guide-call", report_id: "guide-report", text: "Учебный ответ службы: поручение принято.", audio: null}},
  events: [{id: "guide-answer", kind: "answered", at: "2026-01-01T12:00:00Z", card_id: "guide-card", report_id: "guide-report", service_name: contact.service_name,
    text: "Учебный доклад: наряд осматривает участок. Пострадавших нет.", audio: null}],
  due_at: null, processed_reports: 1, total_reports: 1,
}
const noCommand = async () => false
const noChange = () => {}

export function DDSInterfaceGuide() {
  const [run, setRun] = useState(false)
  const [topic, setTopic] = useState<DDSHelpTopic | null>(null)
  const helpButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {helpButton.current?.focus(); setRun(true)}, [])
  return <div className="dispatcher-workspace flex h-screen w-full flex-col overflow-hidden bg-[#c9ced1] text-[#1e2327]" data-testid="dds-interface-guide">
    <div data-dds-help="timing" className="z-50 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-[#157dbd] bg-[#2b3a42] px-4 py-2 text-white">
      <div><h1 className="text-sm font-bold">Знакомство с интерфейсом ДДС</h1><p className="text-xs">Учебный пример · без звонков, сохранения действий и оценок · таймер не запущен</p></div>
      <div data-dds-help="finish" className="flex items-center gap-2">
        <button ref={helpButton} type="button" disabled={run} onClick={event => {event.currentTarget.focus(); setTopic(null); setRun(true)}} className="min-h-10 rounded border border-white/40 px-3 text-xs font-semibold disabled:opacity-60">Повторить знакомство</button>
        <Link href="/student/profile" className="inline-flex min-h-10 items-center rounded bg-slate-700 px-3 text-xs font-semibold">В личный кабинет</Link>
      </div>
    </div>
    <Tutorial run={run} onFinish={() => setRun(false)} context="guide" onTopicChange={setTopic} />
    <DDSWorkspaceContent guide card={card} phone={<DDSTrainingPhone exercise={exercise} tourTopic={run ? topic : undefined} silent disabled
      selectedService={contact.service_name} onServiceChange={noChange} command={noCommand}
      record={{accepted: true, whoAccepted: contact.full_name, setWhoAccepted: noChange,
        summary: "Учебный пример записи: бригада выехала на осмотр участка", setSummary: noChange,
        saved: {whoAccepted: "Учебный начальник бригады", summary: "Номер бригады: УЧ-001\nСодержание доклада: Учебный пример — бригада выехала на осмотр участка"}, onSave: noCommand}} />}
      services={<ServicesBar data={card} disabled completionDisabled closeHref="/student/profile" closeLabel="Выйти из ознакомления"
        disabledReason="Учебный пример: действия не выполняются" completionReason="В ознакомлении карточки не сдаются" />} />
  </div>
}
