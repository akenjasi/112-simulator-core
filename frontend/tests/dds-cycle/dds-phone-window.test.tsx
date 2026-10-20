import React, {useState} from "react"
import {afterEach, expect, it, vi} from "vitest"
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react"
import {DDSTrainingPhone} from "@/components/dispatcher/dds-training-phone"
import type {DDSExercise} from "@/lib/dds-cycle"

const contact = {id:"a",service_name:"Аварийная служба",number:"7000",full_name:"",position:"",brigade:""}
const base = (): DDSExercise => ({version:2,source:"prepared",presentation:"audio_only",contacts:[contact],events:[],outgoing:{},incoming:null,due_at:null,processed_reports:0,total_reports:4})
const answered = (id: string): DDSExercise => ({...base(),incoming:{id,contact,ringing:false,direction:"incoming",text:null,audio:"/api/dds/audio/dds_ivanov_cycle2_1.wav"},
  events:[{id:`call-${id}`,kind:"answered",at:"now",card_id:"card",report_id:id,service_name:contact.service_name}]})
const props = () => ({selectedService:contact.service_name,onServiceChange:vi.fn(),disabled:false,command:vi.fn().mockResolvedValue(true)})
const open = () => fireEvent.click(screen.getByRole("button",{name:"☎ Телефон"}))
const flush = async () => act(async () => {for(let i=0;i<10;i++) await Promise.resolve()})
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()})

it("opens outside the card without blocking it, preserves minimized drafts and sends no phone commands", () => {
  const controls = props(), view = render(<DDSTrainingPhone exercise={answered("arrival")} {...controls}/>)
  open()
  const dialog = screen.getByRole("dialog",{name:"Учебный телефон ДДС"})
  expect(dialog.parentElement).toBe(document.body)
  expect(dialog).toHaveAttribute("aria-modal","false")
  fireEvent.change(screen.getByLabelText("Кто доложил"),{target:{value:"Пупкин — ошибочное ФИО"}})
  fireEvent.change(screen.getByLabelText("Номер бригады в докладе"),{target:{value:"неверный номер"}})
  fireEvent.change(screen.getByLabelText("Содержание доклада"),{target:{value:"Мой черновик"}})
  expect(screen.getByRole("button",{name:"Сохранить запись доклада"})).not.toBeDisabled()
  fireEvent.keyDown(dialog,{key:"Escape"})
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("button",{name:"☎ Телефон"})).toHaveFocus()
  view.rerender(<DDSTrainingPhone exercise={{...answered("arrival")}} {...controls}/>)
  open()
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Пупкин — ошибочное ФИО")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("неверный номер")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Мой черновик")
  expect(controls.command).not.toHaveBeenCalled()
})

it("keeps three fields at every incoming stage and restores only saved student words after reload", async () => {
  const controls = props(), view = render(<DDSTrainingPhone exercise={answered("arrival")} {...controls}/>)
  open()
  for(const id of ["arrival","works","complete"]) {
    view.rerender(<DDSTrainingPhone exercise={answered(id)} {...controls}/>)
    expect(screen.getAllByRole("textbox")).toHaveLength(4)
    expect(screen.getByLabelText("Содержание доклада")).toHaveAttribute("rows","3")
    fireEvent.change(screen.getByLabelText("Кто доложил"),{target:{value:`Ошибка ${id}`}})
    fireEvent.change(screen.getByLabelText("Номер бригады в докладе"),{target:{value:"123"}})
    fireEvent.change(screen.getByLabelText("Содержание доклада"),{target:{value:"Не сверять с эталоном"}})
    fireEvent.click(screen.getByRole("button",{name:"Сохранить запись доклада"})); await flush()
    expect(controls.command).toHaveBeenLastCalledWith({operation:"note",report_id:id,note:`Кто доложил: Ошибка ${id}\nНомер бригады: 123\nСодержание доклада: Не сверять с эталоном`})
  }
  view.unmount()
  render(<DDSTrainingPhone exercise={{...answered("complete"),notes:{complete:"Кто доложил: Ошибка complete\nНомер бригады: 123\nСодержание доклада: Не сверять с эталоном"}}} {...controls}/>)
  open()
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Ошибка complete")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("123")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Не сверять с эталоном")
  expect(screen.getByRole("button",{name:"Доклад записан"})).toBeDisabled()
})

it("preserves legacy free-form notes without inventing identity or brigade", () => {
  render(<DDSTrainingPhone exercise={{...answered("old"),notes:{old:"Иванов И.И. бригада 2 — прибыла\nДополнение"}}} {...props()}/>)
  open()
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Иванов И.И. бригада 2 — прибыла\nДополнение")
  expect(screen.getByRole("button",{name:"Доклад записан"})).toBeDisabled()
})

it("saves the brigade with the first report and restores the same three-field layout", async () => {
  const save = vi.fn().mockResolvedValue(true)
  const ex: DDSExercise = {...base(),incoming:{id:"departure",contact,ringing:false,direction:"outgoing",text:null,audio:null},
    outgoing:{[contact.service_name]:{contact_id:contact.id,call_id:"dial",report_id:"departure",text:null,audio:null}}}
  function Harness({saved = false}: {saved?: boolean}) {
    const [who,setWho] = useState(""), [content,setContent] = useState("")
    return <DDSTrainingPhone exercise={ex} {...props()} record={{accepted:true,whoAccepted:who,setWhoAccepted:setWho,summary:content,setSummary:setContent,onSave:save,
      saved:saved ? {whoAccepted:"Опечатка",summary:"Номер бригады: 17\nСодержание доклада: Выезд"} : undefined}}/>
  }
  const view = render(<Harness/>); open()
  fireEvent.change(screen.getByLabelText("Кто доложил"),{target:{value:"Опечатка"}})
  fireEvent.change(screen.getByLabelText("Номер бригады в докладе"),{target:{value:"17"}})
  fireEvent.change(screen.getByLabelText("Содержание доклада"),{target:{value:"Выезд"}})
  fireEvent.click(screen.getByRole("button",{name:"Сохранить телефонограмму"})); await flush()
  expect(save).toHaveBeenCalledExactlyOnceWith("Номер бригады: 17\nСодержание доклада: Выезд")
  view.rerender(<Harness saved/> )
  expect(screen.getByLabelText("Кто доложил")).toHaveValue("Опечатка")
  expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("17")
  expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Выезд")
  expect(screen.getByRole("button",{name:"Сохранено"})).toBeDisabled()
})

it("opens once for a new incoming call, never accepts automatically and stays minimized during polling", () => {
  const controls = props(), ex: DDSExercise = {...base(),incoming:{id:"arrival",contact,ringing:true,text:null,audio:null}}
  const view = render(<DDSTrainingPhone exercise={ex} {...controls}/>)
  expect(screen.getByRole("dialog")).toBeTruthy()
  expect(screen.getByText("7000")).toBeTruthy()
  fireEvent.click(screen.getByRole("button",{name:"Свернуть телефон"}))
  view.rerender(<DDSTrainingPhone exercise={{...ex,incoming:{...ex.incoming!}}} {...controls}/>)
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("button",{name:"Принять звонок"})).toBeTruthy()
  expect(controls.command).not.toHaveBeenCalled()
  expect(controls.onServiceChange).not.toHaveBeenCalled()
})

it("constrains pointer and keyboard movement, remembers position and clamps on viewport resize", () => {
  vi.stubGlobal("PointerEvent",MouseEvent)
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    if (this.getAttribute("role") !== "dialog") return originalRect.call(this)
    return {left:parseFloat(this.style.left)||12,top:parseFloat(this.style.top)||12,width:880,height:430,right:0,bottom:0,x:0,y:0,toJSON(){}}
  })
  vi.stubGlobal("innerWidth",1400); vi.stubGlobal("innerHeight",1000)
  render(<DDSTrainingPhone exercise={base()} {...props()}/>); open()
  const handle = screen.getByRole("button",{name:"Переместить окно телефона"})
  fireEvent.pointerDown(handle,{button:0,clientX:30,clientY:30})
  fireEvent.pointerMove(handle,{clientX:5000,clientY:5000}); fireEvent.pointerUp(handle)
  expect(screen.getByRole("dialog")).toHaveStyle({left:"508px",top:"558px"})
  fireEvent.keyDown(handle,{key:"ArrowLeft"})
  expect(screen.getByRole("dialog")).toHaveStyle({left:"488px"})
  fireEvent.click(screen.getByRole("button",{name:"Свернуть телефон"})); open()
  expect(screen.getByRole("dialog")).toHaveStyle({left:"488px",top:"558px"})
  vi.stubGlobal("innerWidth",1000); vi.stubGlobal("innerHeight",700)
  fireEvent(window,new Event("resize"))
  expect(screen.getByRole("dialog")).toHaveStyle({left:"108px",top:"258px"})
})

function audioContextMock() {
  const oscillators: {start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>}[] = []
  class Context {
    state = "running"; currentTime = 0; destination = {}
    resume = vi.fn().mockResolvedValue(undefined); close = vi.fn().mockResolvedValue(undefined)
    createOscillator() {const osc = {frequency:{value:0},connect:vi.fn(),start:vi.fn(),stop:vi.fn(),disconnect:vi.fn()}; oscillators.push(osc); return osc}
    createGain() {return {gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()}}
  }
  const create = vi.fn(function(){return new Context()})
  vi.stubGlobal("AudioContext",create)
  return {create,oscillators}
}

it("rings after interaction without duplicating on polling, stops on mute, answer and unmount", async () => {
  vi.useFakeTimers()
  vi.stubGlobal("Audio", class {pause() {}; play() {return Promise.resolve()}})
  const sound = audioContextMock(), controls = props()
  const ex: DDSExercise = {...base(),incoming:{id:"arrival",contact,ringing:true,text:null,audio:null}}
  const view = render(<DDSTrainingPhone exercise={ex} {...controls}/>)
  expect(sound.create).not.toHaveBeenCalled()
  fireEvent.pointerDown(screen.getByRole("button",{name:"Включить звук звонка"})); await flush()
  expect(sound.create).toHaveBeenCalledTimes(1)
  expect(sound.oscillators).toHaveLength(4)
  view.rerender(<DDSTrainingPhone exercise={{...ex}} {...controls}/>)
  expect(sound.oscillators).toHaveLength(4)
  await act(async () => {await vi.advanceTimersByTimeAsync(3000)})
  expect(sound.oscillators).toHaveLength(8)
  fireEvent.click(screen.getByRole("button",{name:"Звук входящего звонка"}))
  expect(sound.oscillators.slice(-4).every(osc=>osc.disconnect.mock.calls.length===1)).toBe(true)
  await act(async () => {await vi.advanceTimersByTimeAsync(3000)})
  expect(sound.oscillators).toHaveLength(8)
  fireEvent.click(screen.getByRole("button",{name:"Звук входящего звонка"}))
  expect(sound.oscillators).toHaveLength(12)
  fireEvent.click(screen.getByRole("button",{name:"Принять звонок"}))
  view.rerender(<DDSTrainingPhone exercise={answered("arrival")} {...controls}/>); await flush()
  await act(async () => {await vi.advanceTimersByTimeAsync(3000)})
  expect(sound.oscillators).toHaveLength(12)
  expect(sound.oscillators.slice(-4).every(osc=>osc.disconnect.mock.calls.length===1)).toBe(true)
  expect(controls.command).toHaveBeenCalledExactlyOnceWith({operation:"answer",report_id:"arrival"})
  view.unmount()
  expect(sound.create.mock.results[0].value.close).toHaveBeenCalledOnce()
})

it("keeps the visible incoming notice usable when sound is unavailable", async () => {
  vi.stubGlobal("AudioContext",undefined)
  const controls = props(), ex: DDSExercise = {...base(),incoming:{id:"arrival",contact,ringing:true,text:null,audio:null}}
  render(<DDSTrainingPhone exercise={ex} {...controls}/>)
  fireEvent.click(screen.getByRole("button",{name:"Включить звук звонка"}))
  fireEvent.click(screen.getByRole("button",{name:"Принять звонок"})); await flush()
  expect(controls.command).toHaveBeenCalledExactlyOnceWith({operation:"answer",report_id:"arrival"})
})

it("dials a manually entered number, switches only on connection and plays the matching service report", async () => {
  const other = {...contact,id:"b",number:"7001",service_name:"04 Газ"}
  const played = vi.fn().mockResolvedValue(undefined), paths: string[] = []
  vi.stubGlobal("Audio", class {constructor(path: string){paths.push(path)} pause() {}; play = played})
  const command = vi.fn()
  function Harness() {
    const [service,setService] = useState(contact.service_name)
    const [ex,setExercise] = useState<DDSExercise>({...base(),contacts:[contact,other]})
    return <DDSTrainingPhone exercise={ex} selectedService={service} onServiceChange={setService} disabled={false} command={async payload => {
      command(payload)
      if (payload.operation === "dial") setExercise({...ex,
        incoming:{id:"gas-departure",contact:other,ringing:false,direction:"outgoing",text:null,audio:"/api/dds/audio/dds_petrov_cycle2_0.wav"},
        outgoing:{[other.service_name]:{contact_id:other.id,call_id:"gas-call",report_id:"gas-departure",text:null,audio:"/api/dds/audio/dds_petrov_cycle2_0.wav"}},
        events:[{id:"gas-call",kind:"dialed",service_name:other.service_name,report_id:"gas-departure",at:"now",card_id:"card"}]})
      return true
    }}/>
  }
  render(<Harness/>); open()
  expect(screen.queryByRole("combobox")).toBeNull()
  fireEvent.change(screen.getByLabelText("Номер учебного телефона"),{target:{value:"7001"}})
  fireEvent.keyDown(screen.getByLabelText("Номер учебного телефона"),{key:"Enter"}); await flush()
  expect(command).toHaveBeenCalledExactlyOnceWith({operation:"dial",number:"7001",service_name:"04 Газ"})
  expect(screen.getByText("04 Газ · 7001")).toBeTruthy()
  expect(screen.getByLabelText("Номер учебного телефона")).toHaveValue("7001")
  expect(paths).toEqual(["/api/dds/audio/dds_petrov_cycle2_0.wav?v=qwen-aidar-phone-v1"])
  expect(played).toHaveBeenCalledOnce()
})

it("sends unknown numbers for server assessment and preserves the previous context on failed connection", async () => {
  const controls = props(); controls.command.mockResolvedValue(false)
  render(<DDSTrainingPhone exercise={base()} {...controls}/>); open()
  fireEvent.change(screen.getByLabelText("Номер учебного телефона"),{target:{value:"9999"}})
  fireEvent.click(screen.getByRole("button",{name:"Набрать"})); await flush()
  expect(controls.command).toHaveBeenCalledExactlyOnceWith({operation:"dial",number:"9999",service_name:contact.service_name})
  expect(controls.onServiceChange).not.toHaveBeenCalled()
})
