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

it("dials the chosen number without silently switching the selected service", () => {
  const command = vi.fn().mockResolvedValue(true), change = vi.fn()
  render(<DDSTrainingPhone exercise={exercise()} selectedService="Аварийная служба" onServiceChange={change} disabled={false} command={command}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"Справочник"}))
  fireEvent.click(screen.getByRole("button",{name:"7001"}))
  fireEvent.click(screen.getByRole("button",{name:"Набрать"}))
  expect(command).toHaveBeenCalledWith({operation:"dial", number:"7001", service_name:"Аварийная служба"})
  expect(change).not.toHaveBeenCalled()
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

it("teacher saves an explicit prepared plan using existing card services", async () => {
  const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({services:["Аварийная служба"],plan:null}),{status:200}))
    .mockImplementationOnce(async (_url, options) => new Response(JSON.stringify({plan:JSON.parse(options.body)}),{status:200}))
  vi.stubGlobal("fetch",network)
  render(<DDSExerciseEditor ticketId="ticket1"/>); fireEvent.click(screen.getByText("Телефон и доклады ДДС")); await screen.findByText("Подготовить план по службам билета")
  fireEvent.click(screen.getByText("Подготовить план по службам билета"))
  fireEvent.change(screen.getByLabelText("ФИО исполнителя"),{target:{value:"Петров Пётр Петрович"}})
  fireEvent.click(screen.getByRole("button",{name:"Сохранить план ДДС"})); await flush()
  expect(network.mock.calls[1][0]).toBe("/api/dds/tickets/ticket1/exercise")
  const body = JSON.parse(network.mock.calls[1][1].body)
  expect(body.source).toBe("prepared")
  expect(body.contacts[0].full_name).toBe("Петров Пётр Петрович")
  expect(body.reports).toHaveLength(4)
})

it("teacher protocol is usable independently of AI report generation", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({sessions:[{session_id:"s",cadet_id:"student",exercise_protocols:[{card_id:"c",criteria:[{key:"stage",label:"Соответствие этапу",status:"completed",evidence:[]}],events:[]}]}]}),{status:200})))
  render(<DDSLessonProtocol lessonId="l1"/>); await flush()
  expect(screen.getByText("Выполнено")).toBeTruthy()
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
  expect(screen.getAllByRole("combobox")).toHaveLength(1)
  fireEvent.change(screen.getByLabelText("Номер учебного телефона"),{target:{value:"7001"}})
  expect(screen.getByLabelText("АОН заявителя")).toHaveTextContent("+7 900 111-22-33")
  expect(screen.getByLabelText("Предоставленный номер заявителя")).toHaveTextContent("+7 900 444-55-66")
  expect(screen.getByLabelText("Телефон на место происшествия")).toHaveTextContent("+7 900 777-88-99")
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

it("reviews one received report at a time and never accepts or advances it during replay", () => {
  const command = vi.fn(), ex = exercise()
  ex.events = [1,2,3].map(n => ({id:`e${n}`,kind:"answered",at:"2026-10-19T00:00:00Z",card_id:"c",service_name:"Аварийная служба",text:`Доклад ${n}`}))
  render(<DDSTrainingPhone exercise={ex} selectedService="Аварийная служба" onServiceChange={vi.fn()} disabled={false} command={command}/>)
  fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
  fireEvent.click(screen.getByRole("button",{name:"Сообщения"}))
  expect(screen.getByText("Доклад 3")).toBeTruthy()
  expect(screen.queryByText("Доклад 1")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Предыдущее сообщение"}))
  expect(screen.getByText("Доклад 2")).toBeTruthy()
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
