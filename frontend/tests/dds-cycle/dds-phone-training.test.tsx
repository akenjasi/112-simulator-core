import React from "react"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react"
import {DDSTrainingPhone} from "@/components/dispatcher/dds-training-phone"
import {DDSProtocol} from "@/components/dispatcher/dds-protocol"
import {DDSExerciseEditor} from "@/components/teacher/dds-exercise-editor"
import {DDSLessonProtocol} from "@/components/teacher/dds-lesson-protocol"
import {validateDDSSessionState, type DDSExercise} from "@/lib/dds-cycle"
const contact = {id:"a", service_name:"Аварийная служба", number:"7000", full_name:"Иванов Иван Иванович", position:"Мастер", brigade:"1"}
const exercise = (): DDSExercise => ({source:"prepared", contacts:[contact, {...contact, id:"b", number:"7001", service_name:"Скорая помощь"}], events:[], outgoing:{}, incoming:null, due_at:null, processed_reports:0, total_reports:8})
const flush = async () => act(async () => {for(let i=0;i<10;i++) await Promise.resolve()})
beforeEach(() => {localStorage.setItem("token","isolated-ui-token")})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

it.each([
  ["/api/dds/audio/dds_ivanov_cycle2_0.wav", "/api/dds/audio/dds_ivanov_cycle2_0.wav?v=qwen-aidar-phone-v1"],
  ["/api/dds/audio/dds_petrov_cycle2_2.wav", "/api/dds/audio/dds_petrov_cycle2_2.wav?v=qwen-aidar-phone-v1"],
  ["/api/dds/audio/dds_ivanov_0.wav", "/api/dds/audio/dds_ivanov_0.wav"],
  ["/audio/tts/generic_reply.wav", "/audio/tts/generic_reply.wav"],
])("replays %s with versioned Qwen audio only for the replaced current recordings", async (path, expected) => {
  const sources: string[] = [], played = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("Audio", class {
    constructor(source: string) {sources.push(source)}
    onended:any; onerror:any; pause() {} play = played
  })
  const command = vi.fn().mockResolvedValue(true), ex = exercise()
  ex.outgoing = {"Аварийная служба":{contact_id:"a",call_id:"call1",text:null,audio:path}}
  const props = {exercise:ex,selectedService:"Аварийная служба",onServiceChange:vi.fn(),disabled:false,command}
  const view = render(<DDSTrainingPhone {...props}/>)
  expect(sources).toEqual([])
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"Прослушать ответ"})); await flush()
  fireEvent.click(screen.getByRole("button",{name:"Прослушать ответ"})); await flush()
  expect(sources).toEqual([expected, expected])
  expect(played).toHaveBeenCalledTimes(2)
  view.rerender(<DDSTrainingPhone {...props} exercise={{...ex}}/>); await flush()
  expect(played).toHaveBeenCalledTimes(2)
  expect(command).not.toHaveBeenCalled()
})

it("determines the service from the dialed directory number without a service selector", async () => {
  const command = vi.fn().mockResolvedValue(true), change = vi.fn()
  render(<DDSTrainingPhone exercise={exercise()} selectedService="Аварийная служба" onServiceChange={change} disabled={false} command={command}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"Справочник"}))
  fireEvent.click(screen.getByRole("button",{name:"7001"}))
  fireEvent.click(screen.getByRole("button",{name:"Набрать"}))
  await flush()
  expect(command).toHaveBeenCalledWith({operation:"dial", number:"7001", service_name:"Скорая помощь"})
  expect(change).toHaveBeenCalledWith("Скорая помощь")
  expect(screen.queryByRole("combobox")).toBeNull()
  expect(screen.queryByRole("button",{name:"Сообщения"})).toBeNull()
})

it("answers explicitly and restores the received message without progressing it", () => {
  const command = vi.fn().mockResolvedValue(true), ex = exercise()
  ex.incoming = {id:"r1", contact, ringing:true, text:null, audio:null}
  const view = render(<DDSTrainingPhone exercise={ex} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={command}/>)
  expect(screen.queryByText("Бригада выехала")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Принять звонок"}))
  expect(command).toHaveBeenCalledWith({operation:"answer", report_id:"r1"})
  view.rerender(<DDSTrainingPhone exercise={{...ex,incoming:{...ex.incoming!,ringing:false,text:"Бригада выехала"}}} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={command}/>)
  expect(screen.getByText("Бригада выехала")).toBeTruthy()
  fireEvent.click(screen.getByRole("button",{name:"Прослушать доклад"}))
  expect(command).toHaveBeenCalledTimes(1)
  expect(screen.getByText("Для сообщения доступен текст.")).toBeTruthy()
})

it("failed playback records unavailable rather than successful playback", async () => {
  vi.stubGlobal("Audio", class {onended:any; onerror:any; pause() {} play(){return Promise.reject(new Error("unavailable"))}})
  const command = vi.fn().mockResolvedValue(true), ex = exercise()
  ex.outgoing = {"Аварийная служба":{contact_id:"a",call_id:"call1",text:"Мастер слушает",audio:"/audio/tts/generic_reply.wav"}}
  render(<DDSTrainingPhone exercise={ex} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={command}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"Прослушать ответ"})); await flush()
  expect(command).toHaveBeenCalledExactlyOnceWith({operation:"audio",call_id:"call1",audio_result:"unavailable"})
  expect(screen.getByText(/Аудио недоступно/)).toBeTruthy()
  expect(screen.getByText("Мастер слушает")).toBeTruthy()
})

it("shows corrected mistakes and timing without inventing numeric grades", () => {
  render(<DDSProtocol criteria={[{key:"stage",label:"Соответствие этапу",status:"completed_after_correction",evidence:[]}]} events={[{id:"m1",kind:"mistake",at:"2026-10-19T00:00:00Z",card_id:"c",message:"Нет доклада"}]}/>)
  expect(screen.getByText("Выполнено после исправления")).toBeTruthy()
  expect(screen.getByText(/Ошибочных попыток: 1/)).toBeTruthy()
  expect(screen.getByText(/Нет доклада/)).toBeTruthy()
  expect(screen.queryByText(/100/)).toBeNull()
})

it("separates accepted content errors from rejected attempts in the teacher protocol", () => {
  render(<DDSProtocol criteria={[{key:"accuracy",label:"Точность записей",status:"not_completed",evidence:[]}]} events={[
    {id:"m1",kind:"mistake",at:"2026-10-19T00:00:00Z",card_id:"c",message:"Нет доклада"},
    {id:"m2",kind:"mistake",at:"2026-10-19T00:01:00Z",card_id:"c",blocking:false,message:"Неверно записано ФИО"},
  ]}/>)
  expect(screen.getByText(/Ошибочных попыток: 1 · Ошибок в записях: 1/)).toBeTruthy()
  expect(screen.getByText("Ошибка в записи · действие сохранено")).toBeTruthy()
  expect(screen.getByText("Не выполнено")).toBeTruthy()
})

it("teacher saves an explicit prepared plan using existing card services", async () => {
  const template = {version:2, source:"prepared", presentation:"audio_only", service_profiles:{"Аварийная служба":"general"},
    contacts:[{...contact, reply:"Начало реагирования. Бригада выехала", dispatch_keywords:["выехала"], audio:"/api/dds/audio/dds_ivanov_cycle2_0.wav"}],
    reports:["Начало реагирования","Прибытие","Проведение работ","Работы завершены"].map((status,i) => ({id:`r${i}`,contact_id:contact.id,status,text:status,comment_keywords:i===3?["задача выполнена"]:[],audio:`/api/dds/audio/dds_ivanov_cycle2_${i}.wav`}))}
  const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({services:["Аварийная служба"],plan:null,default_plan:template}),{status:200}))
    .mockImplementationOnce(async (_url, options) => new Response(JSON.stringify({plan:JSON.parse(options.body)}),{status:200}))
  vi.stubGlobal("fetch",network)
  render(<DDSExerciseEditor ticketId="ticket1"/>); fireEvent.click(screen.getByText("Телефон и доклады ДДС")); await screen.findByText("Подготовить план по службам билета")
  fireEvent.click(screen.getByText("Подготовить план по службам билета"))
  fireEvent.change(screen.getByLabelText("ФИО исполнителя"),{target:{value:"Петров Пётр Петрович"}})
  fireEvent.change(screen.getByLabelText("Ответ на исходящий звонок"),{target:{value:"Начало реагирования. Бригада выехала к месту происшествия."}})
  fireEvent.click(screen.getByRole("button",{name:"Сохранить план ДДС"})); await flush()
  expect(network.mock.calls[1][0]).toBe("/api/dds/tickets/ticket1/exercise")
  const body = JSON.parse(network.mock.calls[1][1].body)
  expect(body.source).toBe("prepared")
  expect(body.contacts[0].full_name).toBe("Петров Пётр Петрович")
  expect(body.reports).toHaveLength(4)
  expect(body.reports[0].text).toBe(body.contacts[0].reply)
  expect(body.reports[0].audio).toBe(body.contacts[0].audio)
})

it("teacher protocol is usable independently of AI report generation", async () => {
  vi.stubGlobal("fetch",vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/phone-notes") ? {cards:[]}
    : {sessions:[{session_id:"s",cadet_id:"student",exercise_protocols:[{card_id:"c",criteria:[{key:"stage",label:"Соответствие этапу",status:"completed",evidence:[]}],events:[]}]}]}),{status:200})))
  render(<DDSLessonProtocol lessonId="l1"/>); await flush()
  expect(await screen.findByText("Выполнено")).toBeTruthy()
  expect(screen.getByText(/независимо от ИИ/)).toBeTruthy()
})

vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()})}))

it("polls incoming calls when the active card is opened through card_id", async () => {
  const {DDSAssignedConsole} = await import("@/components/dispatcher/dds-assigned-console")
  const {emptyDispatcherData} = await import("@/lib/dispatcher-data")
  vi.useFakeTimers()
  try {
    const ex = exercise()
    const state = {session_id:"s", lesson_id:"l", ticket_id:"t", card_id:"c", session_status:"ACTIVE",lesson_status:"ACTIVE",submitted_at:null,score:null,
      incoming_card:{...emptyDispatcherData, description:"Учебная карточка", services:[{id:"a",name:"Аварийная служба",status:"Принята",history:[]}]},
      actions:[], allowed_service_statuses:{"Аварийная служба":["Начало реагирования"]},exercise:ex,criteria:[]}
    const ringing = {...state,exercise:{...ex,incoming:{id:"r",contact,ringing:true,text:null,audio:null}}}
    const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(state),{status:200}))
      .mockImplementation(async () => new Response(JSON.stringify(ringing),{status:200}))
    vi.stubGlobal("fetch",network)
    render(<DDSAssignedConsole sessionId="s" ticketId="t" cardId="c"/>); await flush()
    expect(screen.getByRole("link",{name:"← В личный кабинет"})).toHaveAttribute("href","/student/profile")
    expect(screen.queryByText("Принять звонок")).toBeNull()
    await act(async () => {await vi.advanceTimersByTimeAsync(1000)})
    expect(screen.getByRole("button",{name:"Принять звонок"})).toBeTruthy()
    expect(network.mock.calls[1][0]).toBe("/api/dds/sessions/s/cards/c")
  } finally {cleanup();vi.useRealTimers()}
})

it("keeps grading out of the workspace and records the phone call in a single form", async () => {
  const {DDSAssignedConsole} = await import("@/components/dispatcher/dds-assigned-console")
  const {emptyDispatcherData} = await import("@/lib/dispatcher-data")
  const ex = exercise()
  ex.outgoing = {"Аварийная служба":{contact_id:"a",call_id:"call1",text:"Мастер Иванов слушает",audio:null}}
  const accepted = {request_id:"accepted",kind:"status",service_name:"Аварийная служба",status:"Принята"}
  const state = {session_id:"s",lesson_id:"l",ticket_id:"t",card_id:"c",session_status:"ACTIVE",lesson_status:"ACTIVE",submitted_at:null,score:null,
    incoming_card:{...emptyDispatcherData,description:"Карточка",phones:{aon:"+7 900 111-22-33",provided:"+7 900 444-55-66",onSite:"+7 900 777-88-99"},
      incident:{number:"881412",savedAt:"19.10.2026 в 02:00:00",operator:"Опер. 14, АРМ 7"},
      services:[{id:"a",name:"Аварийная служба",status:"Получена службой",history:[]}]},
    actions:[accepted],exercise:ex,criteria:[{key:"stage",label:"Соответствие этапу",status:"not_completed",evidence:[]}]}
  let saved = state
  let dispatch: any
  const network = vi.fn(async (_url, init) => {
    if (init?.method === "POST") {
      dispatch = JSON.parse(init.body)
      saved = {...state,actions:[accepted,dispatch]}
    }
    return new Response(JSON.stringify(saved),{status:200})
  })
  vi.stubGlobal("fetch",network)
  const view = render(<DDSAssignedConsole sessionId="s"/>); await flush()
  expect(screen.queryByText("Протокол ДДС")).toBeNull()
  expect(screen.queryByText("Соответствие этапу")).toBeNull()
  expect(screen.queryByText("Передача задания бригаде")).toBeNull()
  expect(screen.queryByLabelText("Служба для направления")).toBeNull()
  expect(screen.getByText("Происшествие 881412")).toBeTruthy()
  expect(screen.getByText("Сохр. 19.10.2026 в 02:00:00")).toBeTruthy()
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.getAllByLabelText("Кто принял")).toHaveLength(1)
  expect(screen.queryByRole("combobox")).toBeNull()
  fireEvent.change(screen.getByLabelText("Номер учебного телефона"),{target:{value:"7001"}})
  expect(screen.getByLabelText("АОН заявителя")).toHaveTextContent("+7 (900) 111-22-33")
  expect(screen.getByLabelText("Предоставленный номер заявителя")).toHaveTextContent("+7 (900) 444-55-66")
  expect(screen.getByLabelText("Телефон на место происшествия")).toHaveTextContent("+7 (900) 777-88-99")
  fireEvent.change(screen.getByLabelText("Кто принял"),{target:{value:"Мастер Иванов"}})
  fireEvent.change(screen.getByLabelText("Суть сообщения"),{target:{value:"Убрать ветку у подъезда"}})
  fireEvent.click(screen.getByRole("button",{name:"Сохранить телефонограмму"})); await flush()
  expect(dispatch).toMatchObject({kind:"dispatch",card_id:"c",service_name:"Аварийная служба",who_accepted:"Мастер Иванов",summary:"Убрать ветку у подъезда"})
  expect(screen.getByRole("button",{name:"Сохранено"})).toBeDisabled()
  view.unmount()
  render(<DDSAssignedConsole sessionId="s"/>); await flush()
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.getByLabelText("Кто принял")).toHaveValue("Мастер Иванов")
  expect(screen.getByLabelText("Суть сообщения")).toHaveValue("Убрать ветку у подъезда")
  expect(screen.getByRole("button",{name:"Сохранено"})).toBeDisabled()
})

it("offers replay of the current report without the removed message history", async () => {
  const played = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("Audio", class {pause() {}; play = played})
  const command = vi.fn(), ex = exercise()
  ex.incoming = {id:"r3",contact,ringing:false,text:"Доклад 3",audio:"/api/dds/audio/dds_ivanov_2.wav"}
  ex.events = [1,2,3].map(n => ({id:`e${n}`,kind:"answered",report_id:`r${n}`,at:"2026-10-19T00:00:00Z",card_id:"c",service_name:"Аварийная служба",text:`Доклад ${n}`}))
  render(<DDSTrainingPhone exercise={ex} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={command}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.getByText("Доклад 3")).toBeTruthy()
  expect(screen.queryByText("Доклад 1")).toBeNull()
  expect(screen.queryByRole("button",{name:"Сообщения"})).toBeNull()
  expect(screen.queryByRole("button",{name:"Предыдущее сообщение"})).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Прослушать доклад"})); await flush()
  expect(played).toHaveBeenCalledOnce()
  expect(command).not.toHaveBeenCalled()
})

it("retains a rejected telephone record for correction without showing a successful save", async () => {
  const {DDSAssignedConsole} = await import("@/components/dispatcher/dds-assigned-console")
  const {emptyDispatcherData} = await import("@/lib/dispatcher-data")
  const ex = exercise()
  ex.outgoing = {"Аварийная служба":{contact_id:"a",call_id:"call1",text:"Мастер слушает",audio:null}}
  const state = {session_id:"s",lesson_id:"l",ticket_id:"t",card_id:"c",session_status:"ACTIVE",lesson_status:"ACTIVE",submitted_at:null,score:null,
    incoming_card:{...emptyDispatcherData,description:"Карточка",services:[{id:"a",name:"Аварийная служба",status:"Принята",history:[]}]},
    actions:[],exercise:ex,criteria:[]}
  vi.stubGlobal("fetch",vi.fn(async (_url,init) => new Response(JSON.stringify(init?.method === "POST"
    ? {...state,last_attempt:{request_id:JSON.parse(init.body).request_id,accepted:false,reason:"dispatch_content",message:"Уточните переданное поручение"}} : state),{status:200})))
  render(<DDSAssignedConsole sessionId="s"/>); await flush()
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.change(screen.getByLabelText("Кто принял"),{target:{value:"Иванов"}})
  fireEvent.change(screen.getByLabelText("Суть сообщения"),{target:{value:"Черновик"}})
  fireEvent.click(screen.getByRole("button",{name:"Сохранить телефонограмму"})); await flush()
  expect(screen.getByRole("alert")).toHaveTextContent("Уточните переданное поручение")
  expect(screen.getByLabelText("Кто принял")).toHaveValue("Иванов")
  expect(screen.getByLabelText("Суть сообщения")).toHaveValue("Черновик")
  expect(screen.queryByRole("button",{name:"Сохранено"})).toBeNull()
  expect(screen.getByRole("button",{name:"Сохранить телефонограмму"})).not.toBeDisabled()
})

it("pages a long received message without adding a growing report feed", () => {
  const ex = exercise()
  ex.incoming = {id:"r1",contact,ringing:false,text:"А".repeat(420)+"Конец сообщения",audio:null}
  render(<DDSTrainingPhone exercise={ex} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={vi.fn()}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.queryByText("Конец сообщения")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Следующая часть"}))
  expect(screen.getByText("Конец сообщения")).toBeTruthy()
})

it("plays an explicitly answered audio-only report once, permits replay and never exposes its transcript", async () => {
  const played = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("Audio", class {onended:any; onerror:any; pause() {} play = played})
  const command = vi.fn().mockResolvedValue(true), ex = exercise()
  ex.presentation = "audio_only"
  ex.incoming = {id:"r1", contact, ringing:true, text:null, audio:null}
  const props = {selectedService:"Аварийная служба",onServiceChange:vi.fn(),disabled:false,command}
  const view = render(<DDSTrainingPhone exercise={ex} {...props}/> )
  fireEvent.click(screen.getByRole("button",{name:"Принять звонок"})); await flush()
  const answered: DDSExercise = {...ex, incoming:{...ex.incoming!,ringing:false,text:"SECRET TRANSCRIPT",audio:"/api/dds/audio/dds_ivanov_0.wav"},
    events:[{id:"call1",kind:"answered",report_id:"r1",at:"now",card_id:"c",text:"SECRET TRANSCRIPT"}]}
  view.rerender(<DDSTrainingPhone exercise={answered} {...props}/>); await flush()
  expect(played).toHaveBeenCalledTimes(1)
  expect(screen.queryByText("SECRET TRANSCRIPT")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Прослушать доклад"})); await flush()
  expect(played).toHaveBeenCalledTimes(2)
  view.rerender(<DDSTrainingPhone exercise={{...answered,notes:{r1:"Моя запись"}}} {...props}/>); await flush()
  expect(played).toHaveBeenCalledTimes(2)
  view.unmount()
  render(<DDSTrainingPhone exercise={answered} {...props}/>); await flush()
  expect(played).toHaveBeenCalledTimes(2)
  expect(command.mock.calls.filter(([payload]) => payload.operation === "answer")).toHaveLength(1)
})

it("preserves the report draft during polling, saves it and restores only the trainee's own words", async () => {
  const command = vi.fn().mockResolvedValue(true), ex = exercise()
  ex.presentation = "audio_only"
  ex.incoming = {id:"r1",contact,ringing:false,text:null,audio:"/api/dds/audio/dds_ivanov_0.wav"}
  ex.events = [{id:"call1",kind:"answered",report_id:"r1",at:"now",card_id:"c"}]
  const props = {selectedService:"Аварийная служба",onServiceChange:vi.fn(),disabled:false,command}
  const view = render(<DDSTrainingPhone exercise={ex} {...props}/> )
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.change(screen.getByLabelText("Кто доложил"),{target:{value:"Иванов"}})
  fireEvent.change(screen.getByLabelText("Номер бригады в докладе"),{target:{value:"1"}})
  fireEvent.change(screen.getByLabelText("Содержание доклада"),{target:{value:"Бригада выехала."}})
  view.rerender(<DDSTrainingPhone exercise={{...ex}} {...props}/> )
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Иванов")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("1")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Бригада выехала.")
  fireEvent.click(screen.getByRole("button",{name:"Сохранить запись доклада"})); await flush()
  expect(command).toHaveBeenCalledExactlyOnceWith({operation:"note",report_id:"r1",note:"Кто доложил: Иванов\nНомер бригады: 1\nСодержание доклада: Бригада выехала."})
  view.rerender(<DDSTrainingPhone exercise={{...ex,notes:{r1:"Кто доложил: Иванов\nНомер бригады: 1\nСодержание доклада: Бригада выехала."}}} {...props}/> )
  expect(screen.getByRole("button",{name:"Доклад записан"})).toBeDisabled()
  fireEvent.click(screen.getByRole("button",{name:"Свернуть телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Иванов")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("1")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Бригада выехала.")
})

it("lets the owning teacher compare a trainee report note with the recording transcript", async () => {
  vi.stubGlobal("fetch",vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/phone-notes")
    ? {cards:[{card_id:"c",notes:[{report_id:"r1",service_name:"Газ",note:"Моя запись доклада",expected_text:"Эталон произнесённой реплики"}]}]}
    : {sessions:[{session_id:"s",cadet_id:"student",exercise_protocols:[{card_id:"c",criteria:[],events:[]}]}]}),{status:200})))
  render(<DDSLessonProtocol lessonId="l"/>)
  await screen.findByText("Запись обучаемого · Газ")
  expect(screen.getByText("Моя запись доклада",{exact:false})).toBeTruthy()
  expect(screen.getByText("Эталон произнесённой реплики",{exact:false})).toBeTruthy()
})

it("uses the outgoing departure report as the only first phone record in v2", () => {
  const ex: DDSExercise={...exercise(),version:2,presentation:"audio_only", incoming:{id:"departure",contact,ringing:false,direction:"outgoing",text:null,audio:"/api/dds/audio/dds_ivanov_cycle2_0.wav"},
    outgoing:{[contact.service_name]:{contact_id:contact.id,call_id:"dial",report_id:"departure",text:null,audio:"/api/dds/audio/dds_ivanov_cycle2_0.wav"}},
    events:[{id:"dial",kind:"dialed",at:"2026-10-19T00:00:00Z",card_id:"card",report_id:"departure",service_name:contact.service_name,audio:"/api/dds/audio/dds_ivanov_cycle2_0.wav"}]}
  const save=vi.fn().mockResolvedValue(true)
  render(<DDSTrainingPhone exercise={ex} selectedService={contact.service_name} onServiceChange={vi.fn()} disabled={false} command={vi.fn()} record={{accepted:true,whoAccepted:"Опечатка",setWhoAccepted:vi.fn(),summary:"123",setSummary:vi.fn(),onSave:save}}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Опечатка")
  expect(screen.getAllByLabelText("Содержание доклада")).toHaveLength(1)
  fireEvent.change(screen.getByLabelText("Номер бригады в докладе"),{target:{value:"ошибка"}})
  expect(screen.getByRole("button",{name:"Прослушать доклад"})).toBeTruthy()
  fireEvent.click(screen.getByRole("button",{name:"Сохранить телефонограмму"}))
  expect(save).toHaveBeenCalledExactlyOnceWith("Номер бригады: ошибка\nСодержание доклада: 123")
})
