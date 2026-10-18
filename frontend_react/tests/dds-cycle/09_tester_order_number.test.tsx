import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ServicesBar } from "@/components/dispatcher/services-bar"
import { dispatcherData } from "@/lib/dispatcher-data"

afterEach(cleanup)

describe("FIX-09: Order number validation in ServicesBar", () => {
  const data = {
    ...dispatcherData,
    description: "Учебный пожар",
    services: [{ ...dispatcherData.services[0], status: "Получена службой" }],
  }

  it("disables confirm button and shows hint when order number is empty or whitespace", () => {
    const onStatusChange = vi.fn()
    render(<ServicesBar data={data} onStatusChange={onStatusChange} />)

    // Open pencil
    fireEvent.click(screen.getByRole("button", { name: "Редактировать статус" }))

    const confirmBtn = screen.getByRole("button", { name: "Подтвердить" })
    const orderInput = screen.getByPlaceholderText("Номер наряда")

    // Initially empty -> disabled
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn.getAttribute("title")).toContain("Укажите номер наряда")

    // Whitespace only -> disabled
    fireEvent.change(orderInput, { target: { value: "    " } })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn.getAttribute("title")).toContain("Укажите номер наряда")

    // Attempting to click disabled confirm does not invoke callback
    fireEvent.click(confirmBtn)
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it("enables confirm button and passes trimmed order number to onStatusChange", async () => {
    const onStatusChange = vi.fn().mockResolvedValue(true)
    render(<ServicesBar data={data} onStatusChange={onStatusChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Редактировать статус" }))

    const confirmBtn = screen.getByRole("button", { name: "Подтвердить" })
    const orderInput = screen.getByPlaceholderText("Номер наряда")

    // Enter valid order number with whitespace padding
    fireEvent.change(orderInput, { target: { value: "   П-101-А   " } })
    expect(confirmBtn).not.toBeDisabled()
    expect(confirmBtn.getAttribute("title")).toBe("Подтвердить")

    // Click confirm
    fireEvent.click(confirmBtn)
    expect(onStatusChange).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith(
      data.services[0].name,
      "Принята",
      "",
      "П-101-А"
    )
  })

  it("refusal requires both order number and reason comment", () => {
    const onStatusChange = vi.fn()
    render(
      <ServicesBar
        data={data}
        onStatusChange={onStatusChange}
        allowedStatuses={{ [data.services[0].name]: ["Принята", "Не принята"] }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Редактировать статус" }))

    const confirmBtn = screen.getByRole("button", { name: "Подтвердить" })
    const orderInput = screen.getByPlaceholderText("Номер наряда")

    // Switch to refusal
    fireEvent.click(screen.getByRole("button", { name: "Выбрать статус службы" }))
    fireEvent.click(screen.getByText("Не принята"))

    const reasonInput = screen.getByPlaceholderText("Причина отказа (обязательно)")

    // Neither order number nor comment -> disabled
    expect(confirmBtn).toBeDisabled()

    // Order number only, no comment -> disabled with refusal hint
    fireEvent.change(orderInput, { target: { value: "ОТК-1" } })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn.getAttribute("title")).toContain("Укажите причину отказа")

    // Comment only, whitespace order number -> disabled with order number hint
    fireEvent.change(orderInput, { target: { value: "   " } })
    fireEvent.change(reasonInput, { target: { value: "Не в зоне ответственности" } })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn.getAttribute("title")).toContain("Укажите номер наряда")

    // Both provided -> enabled
    fireEvent.change(orderInput, { target: { value: "ОТК-1" } })
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    expect(onStatusChange).toHaveBeenCalledWith(
      data.services[0].name,
      "Не принята",
      "Не в зоне ответственности",
      "ОТК-1"
    )
  })
})
