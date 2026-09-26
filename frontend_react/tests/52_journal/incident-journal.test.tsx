import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import OperatorJournalPage from "@/app/operator/journal/page"

describe("ТЗ 52: Frontend — Главный экран (Журнал/Грид Карточек ПОВ-112 по последнему скриншоту)", () => {
  it("1. Отображает верхний блок поиска с заголовком, строкой ввода, ссылкой расширенного поиска и кнопкой сброса", () => {
    render(<OperatorJournalPage />)

    expect(screen.getByText("Поиск происшествий")).toBeInTheDocument()
    const searchInput = screen.getByLabelText("Поиск происшествий")
    expect(searchInput).toBeInTheDocument()

    expect(screen.getByText("расширенный по параметрам")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "сбросить" })).toBeInTheDocument()
  })

  it("2. Отображает правую шапку: дату 17 Февраль 2025, оператора (оп. 227, АРМ 007, справку в рамке), телефонию, часы 10:22:52 и оранжевую кнопку", () => {
    render(<OperatorJournalPage />)

    expect(screen.getByText("Понедельник, 17 Февраль 2025")).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes("Глущенко О И"))).toBeInTheDocument()
    expect(screen.getByText("АРМ 007")).toBeInTheDocument()
    expect(screen.getByText("Подключение")).toBeInTheDocument()
    expect(screen.getByText("Перейти в перерыв")).toBeInTheDocument()

    // Clock
    expect(screen.getByText("10:22")).toBeInTheDocument()
    expect(screen.getByText(":52")).toBeInTheDocument()

    // Orange button to create new card
    const createBtn = screen.getByRole("link", { name: /создать новую карточку/i })
    expect(createBtn).toBeInTheDocument()
    expect(createBtn).toHaveAttribute("href", "/operator")
  })

  it("3. Отображает 13 разделов навигации (журнал, экран, статистика, УЕР, БДПН, вики, заявители, техника, аудит, отчеты, контроль, смена, регионы)", () => {
    render(<OperatorJournalPage />)

    const expectedTabs = [
      "журнал",
      "экран",
      "статистика",
      "УЕР",
      "БДПН",
      "вики",
      "заявители",
      "техника",
      "аудит",
      "отчеты",
      "контроль",
      "смена",
      "регионы",
    ]

    expectedTabs.forEach((tab) => {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument()
    })
  })

  it("4. Отображает подшапку со списком происшествий, уведомлениями, свитчами автообновления и очереди, кнопкой 'выберите что показать'", () => {
    render(<OperatorJournalPage />)

    expect(screen.getByText("Список происшествий")).toBeInTheDocument()
    expect(screen.getByText("уведомления")).toBeInTheDocument()
    expect(screen.getByText("автообновление")).toBeInTheDocument()
    expect(screen.getByText("обращения в очереди")).toBeInTheDocument()
    expect(screen.getByText("выберите что показать")).toBeInTheDocument()

    // Switch toggling
    const autoRefreshBtn = screen.getByText("автообновление").closest("div")
    expect(autoRefreshBtn).toBeInTheDocument()
    if (autoRefreshBtn) {
      fireEvent.click(autoRefreshBtn)
      expect(screen.getByText("Автообновление выключено")).toBeInTheDocument()
    }
  })

  it("5. Отображает таблицу 'Список происшествий' со всеми колонками и моковыми записями точно по скриншоту", () => {
    render(<OperatorJournalPage />)

    // Column headers
    expect(screen.getByText("Связи")).toBeInTheDocument()
    expect(screen.getByText("ЧС")).toBeInTheDocument()
    expect(screen.getByText("Опер.")).toBeInTheDocument()
    expect(screen.getByText("АРМ")).toBeInTheDocument()
    expect(screen.getByText("Номер")).toBeInTheDocument()
    expect(screen.getByText("Дата")).toBeInTheDocument()
    expect(screen.getByText("Время")).toBeInTheDocument()
    expect(screen.getByText("Тип происшествия")).toBeInTheDocument()
    expect(screen.getByText("Постр.")).toBeInTheDocument()
    expect(screen.getByText("Статус")).toBeInTheDocument()
    expect(screen.getByText("Адрес")).toBeInTheDocument()
    expect(screen.getAllByText("Проверена").length).toBeGreaterThanOrEqual(1)

    // Incident records from screenshot
    expect(screen.getByText("38260204")).toBeInTheDocument()
    expect(screen.getByText("38260202")).toBeInTheDocument()
    expect(screen.getByText("38260201")).toBeInTheDocument()
    expect(screen.getByText("38260199")).toBeInTheDocument()
    expect(screen.getByText("38260198")).toBeInTheDocument()
    expect(screen.getByText("38260197")).toBeInTheDocument()
    expect(screen.getByText("38260195")).toBeInTheDocument()
    expect(screen.getByText("38260193")).toBeInTheDocument()
    expect(screen.getByText("38260192")).toBeInTheDocument()
    expect(screen.getByText("38260191")).toBeInTheDocument()

    // Incident types
    expect(screen.getAllByText("Ошибочно набран номер").length).toBe(3)
    expect(screen.getAllByText("Справка-103").length).toBe(6)
    expect(screen.getByText("Дополнительный звонок от заявителя")).toBeInTheDocument()

    // Specific address
    expect(screen.getByText("Москва , (ЦАО, Тверской район)")).toBeInTheDocument()

    // Check pink paperclip link indicator for 38260193
    const pinkLinkBtn = screen.getByTitle("Имеются связанные карточки")
    expect(pinkLinkBtn).toBeInTheDocument()

    // 2nd column from right: Clipboard icon instead of delete button
    const clipboardBtns = screen.getAllByTitle("Планшет карточки")
    expect(clipboardBtns.length).toBe(10)

    // Time formatting: contains hours/minutes and raised seconds
    expect(screen.getAllByText("10:21").length).toBeGreaterThan(0)
    expect(screen.getByText(":42")).toBeInTheDocument()
  })

  it("6. Отображает скрепленную строку описания в свернутом виде и позволяет открывать/сворачивать предпросмотр карточки", () => {
    render(<OperatorJournalPage />)

    // Initial state: description from row 1 is already visible in collapsed card
    const descText = screen.getByText("17.02.2025 10:21:50 Опер. 951 Захватов А. В. - нет ответа")
    expect(descText).toBeInTheDocument()

    // Description row background must be #49555d
    const descContainer = descText.closest("div")
    expect(descContainer).toHaveStyle({ backgroundColor: "#49555d" })

    // Open preview for row 1
    const expandChevron = screen.getAllByTitle("Открывает предпросмотр карточки")[0]
    fireEvent.click(expandChevron)

    // Preview details are now rendered: Службы, Заявитель, Информация, Отработки
    expect(screen.getByText("Службы:")).toBeInTheDocument()
    expect(screen.getByText("Заявитель:")).toBeInTheDocument()
    expect(screen.getByText("Информация:")).toBeInTheDocument()
    expect(screen.getByText("Отработки:")).toBeInTheDocument()
    expect(screen.getByText("Иванов Сергей Петрович")).toBeInTheDocument()

    // Collapse preview
    const collapseChevron = screen.getByTitle("Свернуть предпросмотр карточки")
    fireEvent.click(collapseChevron)

    // Preview details are hidden, but description remains visible
    expect(screen.queryByText("Службы:")).not.toBeInTheDocument()
    expect(screen.getByText("17.02.2025 10:21:50 Опер. 951 Захватов А. В. - нет ответа")).toBeInTheDocument()
  })

  it("7. Поддерживает поиск и сброс фильтрации происшествий", () => {
    render(<OperatorJournalPage />)

    const searchInput = screen.getByLabelText("Поиск происшествий")
    fireEvent.change(searchInput, { target: { value: "Тверской" } })

    // Only row 6 should be visible
    expect(screen.getByText("38260197")).toBeInTheDocument()
    expect(screen.queryByText("38260204")).not.toBeInTheDocument()

    // Reset button
    const resetBtn = screen.getByRole("button", { name: "сбросить" })
    fireEvent.click(resetBtn)

    expect(searchInput).toHaveValue("")
    expect(screen.getByText("38260204")).toBeInTheDocument()
  })

  it("8. Отображает футер таблицы с кнопкой выбора группы и точной пагинацией '1-10 из 23030'", () => {
    render(<OperatorJournalPage />)

    expect(screen.getByText("выберите группу")).toBeInTheDocument()
    expect(screen.getByText("Страница:")).toBeInTheDocument()
    expect(screen.getByText("Записей на странице:")).toBeInTheDocument()
    expect(screen.getByText("1-10 из 23030")).toBeInTheDocument()
    expect(screen.getByTitle("Предыдущая")).toBeInTheDocument()
    expect(screen.getByTitle("Следующая")).toBeInTheDocument()
  })
})
