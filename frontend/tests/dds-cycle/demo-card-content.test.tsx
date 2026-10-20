import {cleanup, render, screen} from "@testing-library/react"
import {afterEach, expect, it} from "vitest"
import {CallerPanel} from "@/components/dispatcher/caller-panel"
import {IncidentPanel} from "@/components/dispatcher/incident-panel"
import {ServicesBar} from "@/components/dispatcher/services-bar"
import {TopBar} from "@/components/dispatcher/top-bar"
import {dispatcherData, type DispatcherData} from "@/lib/dispatcher-data"

afterEach(cleanup)

const examples = [
  {name: "Крылова Полина Саввична", phone: "+79366215467", formatted: "+7 (936) 621-54-67",
    title: "Дерево. Двор (упало).", klass: "Дерево упало во дворе", medical: false,
    services: ["Гор. Хозяйство", "Управа района / Префектура"]},
  {name: "Маслова Маргарита Макаровна", phone: "+79459288149", formatted: "+7 (945) 928-81-49",
    title: "Прорыв воды. Двор.", klass: "Прорыв воды из-под асфальта", medical: false,
    services: ["Мосводоканал", "Гор. Хозяйство"]},
  {name: "Кудряшов Евдоким Тимофеевич", phone: "+79201001717", formatted: "+7 (920) 100-17-17",
    title: "Лифт. Застревание. Медицинская помощь.", klass: "Застревание в лифте (требуется медицинская помощь)", medical: true,
    services: ["Мослифт", "01 Пожарные", "03 Скорая"]},
  {name: "Кудрявцев Павел Фомич", phone: "+79830339846", formatted: "+7 (983) 033-98-46",
    title: "Запах газа. Подъезд.", klass: "Запах бытового газа в многоквартирном доме", medical: false,
    services: ["04 Газ", "01 Пожарные"]},
]

it.each(examples)("renders the full caller and distinct classification for $title after reopening", example => {
  const card: DispatcherData = {...structuredClone(dispatcherData),
    caller: {name: example.name, role: "очевидец", address: "г. Москва, Ореховый бульвар, д. 35, к. 1"},
    phones: {aon: example.phone, provided: example.phone, onSite: ""},
    classification: {section: example.title.startsWith("Запах") ? "Запах газа" : "Аварии и происшествия в городском хозяйстве",
      title: example.title, class: example.klass, visClass: ""},
    statuses: {injured: example.medical ? "да" : "нет", blocked: example.medical ? "да" : "нет", ambulanceRefusal: "нет"},
    services: example.services.map((name, index) => ({id: `srv-${index}`, name, time: "12:00", status: "Получена службой" as const,
      isRejected: false, history: []})),
  }
  function Workstation({data}: {data: DispatcherData}) {
    return <><TopBar data={data}/><CallerPanel data={data}/><IncidentPanel data={data}/><ServicesBar data={data}/></>
  }
  const view = render(<Workstation data={card}/> )
  function check() {
    expect(screen.getByText(example.name)).toBeVisible()
    expect(screen.getByText("очевидец")).toBeVisible()
    expect(screen.queryByText("Учебный заявитель")).toBeNull()
    expect(screen.getByLabelText("АОН заявителя")).toHaveTextContent(example.formatted)
    expect(screen.getByLabelText("Предоставленный номер заявителя")).toHaveTextContent(example.formatted)
    expect(screen.getByText(example.title)).toBeVisible()
    expect(screen.getByText(example.klass)).toBeVisible()
    expect(screen.getByText("[ВИС] Класс.:").nextElementSibling).toHaveTextContent(/^$/)
    expect(screen.getByText("Пострадавшие:")).toHaveTextContent(example.medical ? "да" : "нет")
    expect(screen.getByText("Заблокированные:")).toHaveTextContent(example.medical ? "да" : "нет")
    for (const name of example.services) expect(screen.getByText(name)).toBeVisible()
  }
  check()
  view.unmount()
  render(<Workstation data={JSON.parse(JSON.stringify(card))}/> )
  check()
})
