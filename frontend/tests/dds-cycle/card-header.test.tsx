import {cleanup, render, screen} from "@testing-library/react"
import {afterEach, expect, it} from "vitest"
import {TopBar, formatCallerPhone, formatCardSavedAt, formatSourceOperator} from "@/components/dispatcher/top-bar"
import {dispatcherData} from "@/lib/dispatcher-data"

afterEach(cleanup)

it.each(["+79990001122", "8 (999) 000-11-22", "9990001122", "+7 (999) 000-11-22"])("formats subscriber number %s as in the manual", number => {
  expect(formatCallerPhone(number)).toBe("+7 (999) 000-11-22")
})

it.each(["112", "7001", "Учебный номер", "", "+1 212 555-0100", "+79990001122 доб. 5"])("preserves short, foreign and nonstandard source numbers: %s", number => {
  expect(formatCallerPhone(number)).toBe(number)
})

it("renders saved source metadata without replacing the incident number or mutating the card", () => {
  const card = {...dispatcherData, phones: {aon: "+79990001122", provided: "+79990002233", onSite: "112"},
    incident: {number: "A1-112", savedAt: "2026-10-20T08:57:19Z", operator: "112"}}
  const before = JSON.stringify(card)
  render(<TopBar data={card} />)
  expect(screen.getByLabelText("АОН заявителя")).toHaveTextContent("+7 (999) 000-11-22")
  expect(screen.getByLabelText("Предоставленный номер заявителя")).toHaveTextContent("+7 (999) 000-22-33")
  expect(screen.getByLabelText("Телефон на место происшествия")).toHaveTextContent("112")
  expect(screen.getByText("Происшествие A1-112")).toBeTruthy()
  expect(screen.getByText("Сохр. 20.10.2026 в 11:57:19")).toBeTruthy()
  expect(screen.getByText("Опер. 14, АРМ 7, Рожкова О. И.")).toBeTruthy()
  expect(screen.queryByRole("button", {name: /^Справка:/})).toBeNull()
  expect(JSON.stringify(card)).toBe(before)
})

it("retains the precision of old save times and leaves unknown times explicit", () => {
  expect(formatCardSavedAt("19.10.2026 14:44")).toBe("Сохр. 19.10.2026 в 14:44")
  expect(formatCardSavedAt("Сохр. 20.08.2021 в 11:57:19")).toBe("Сохр. 20.08.2021 в 11:57:19")
  expect(formatCardSavedAt("")).toBe("Сохр. не указано")
})

it("abbreviates a full source name and retains the actual operator and workstation", () => {
  expect(formatSourceOperator("Опер. 25, АРМ 9, Иванов Иван Иванович")).toBe("Опер. 25, АРМ 9, Иванов И. И.")
  expect(formatSourceOperator("Опер. 25, АРМ 9, Иванов И. И.")).toBe("Опер. 25, АРМ 9, Иванов И. И.")
})
