"use client"

import { X } from "lucide-react"

const border = "#c9ced1"
const slate = "#49555d"
const blue = "#157dbd"
const orange = "#ec653b"
const muted = "#9aa3a9"

function Pill({
  children,
  active,
  onClick,
  multiline,
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  multiline?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] 2xl:text-[13px] leading-tight text-center transition-colors cursor-pointer select-none rounded-[1px] active:scale-[0.98] ${
        active ? "shadow-sm font-semibold" : "hover:bg-gray-100"
      }`}
      style={{
        padding: multiline ? "5px 10px" : "6px 11px",
        border: `1px solid ${active ? blue : border}`,
        background: active ? blue : "#fbfdfe",
        color: active ? "#fff" : slate,
        whiteSpace: multiline ? "normal" : "nowrap",
      }}
    >
      {children}
    </button>
  )
}

function QuestionnaireRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-2.5">
      <div className="text-[13px] pt-1 font-medium select-none shrink-0" style={{ color: muted, width: 150 }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1">{children}</div>
    </div>
  )
}

type Props = {
  selectedPills: Record<string, boolean>
  togglePill: (id: string) => void
  topStatuses: Record<string, boolean>
  toggleTopStatus: (id: string) => void
  onNoContact?: () => void
  onCallDropped?: () => void
  onAddIncidentType?: () => void
  onCloseIncident?: () => void
  activeIncidentTitle?: string
}

export function OperatorRightPanel({
  selectedPills,
  togglePill,
  topStatuses,
  toggleTopStatus,
  onNoContact,
  onCallDropped,
  onAddIncidentType,
  onCloseIncident,
  activeIncidentTitle = "Происшествие 101",
}: Props) {
  return (
    <div className="flex flex-col gap-2.5 p-3 overflow-y-auto h-full" style={{ background: "#fff" }}>
      {/* 1. Верхние кнопки быстрого реагирования */}
      <div className="flex items-stretch gap-2.5">
        <div className="flex gap-2 p-1.5 flex-1" style={{ border: `1px solid ${border}` }}>
          <Pill
            multiline
            active={topStatuses["victims"]}
            onClick={() => toggleTopStatus("victims")}
          >
            Пострадавшие
          </Pill>
          <Pill
            multiline
            active={topStatuses["refusal"]}
            onClick={() => toggleTopStatus("refusal")}
          >
            Нет на месте/
            <br />
            Отказ от скорой
          </Pill>
          <Pill
            multiline
            active={topStatuses["blocked"]}
            onClick={() => toggleTopStatus("blocked")}
          >
            Нет доступа/
            <br />
            Заблокированные
          </Pill>
        </div>

        <div className="flex gap-2 p-1.5" style={{ border: `1px solid ${border}` }}>
          <button
            type="button"
            onClick={onNoContact}
            className={`text-[13px] font-semibold transition-colors cursor-pointer select-none rounded-[1px] active:scale-95 ${
              topStatuses["no_contact"]
                ? "bg-[#ec653b] text-white"
                : "bg-white text-[#ec653b] hover:bg-orange-50"
            }`}
            style={{ padding: "6px 12px", border: `1px solid ${orange}` }}
            title="Зафиксировать: нет контакта с абонентом"
          >
            нет контакта
          </button>
          <button
            type="button"
            onClick={onCallDropped}
            className={`text-[13px] font-semibold transition-colors cursor-pointer select-none rounded-[1px] active:scale-95 ${
              topStatuses["call_dropped"]
                ? "bg-[#ec653b] text-white"
                : "bg-white text-[#ec653b] hover:bg-orange-50"
            }`}
            style={{ padding: "6px 12px", border: `1px solid ${orange}` }}
            title="Зафиксировать: срыв звонка / обрыв соединения"
          >
            срыв звонка
          </button>
        </div>
      </div>

      {/* 2. Полоса «добавить тип происшествия» */}
      <button
        type="button"
        onClick={onAddIncidentType}
        className="px-3 py-2 text-[15px] font-normal text-left transition-colors hover:bg-[#e4e7e9] active:bg-[#d8dcde] cursor-pointer rounded-[1px]"
        style={{ background: "#efefef", color: muted, border: `1px dashed ${border}` }}
        title="Добавить категорию происшествия из ЕКП"
      >
        + добавить тип происшествия
      </button>

      {/* 3. Вкладка классификатора происшествия */}
      <div>
        <button
          type="button"
          className="text-[13px] font-semibold rounded-t-[1px]"
          style={{ padding: "6px 16px", border: `1px solid ${border}`, borderBottom: "none", background: "#fbfdfe", color: slate }}
        >
          {activeIncidentTitle}
        </button>
      </div>

      {/* 4. Карточка опросника происшествия 101 */}
      <div style={{ border: `1px solid ${border}` }} className="flex-1 flex flex-col min-h-0">
        <div
          className="flex items-center justify-between px-3.5 py-1.5 select-none"
          style={{ background: "#303335" }}
        >
          <span className="text-[14px] font-bold text-white underline decoration-white/60 underline-offset-4">
            {activeIncidentTitle}
          </span>
          <button
            type="button"
            onClick={onCloseIncident}
            className="text-white/80 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-white/10"
            title="Закрыть блок"
            aria-label="Закрыть блок"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3.5 divide-y overflow-y-auto flex-1" style={{ borderColor: border }}>
          {/* Группа «Где» */}
          <QuestionnaireRow label="Где">
            {["Улица", "Транспорт", "Дом", "Здание/объект", "Опасный объект"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`where_${item}`]}
                onClick={() => togglePill(`where_${item}`)}
              >
                {item}
              </Pill>
            ))}
          </QuestionnaireRow>

          {/* Группа «Признак пожара (дом)» */}
          <QuestionnaireRow label="Признак пожара (дом)">
            {["Дым", "Открытое пламя", "Запах гари"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`fire_${item}`]}
                onClick={() => togglePill(`fire_${item}`)}
              >
                {item}
              </Pill>
            ))}
            <div className="w-full h-0" />
            <Pill
              active={selectedPills["fire_alarm"]}
              onClick={() => togglePill("fire_alarm")}
            >
              Сработала пожарная сигнализация
            </Pill>
          </QuestionnaireRow>

          {/* Группа «Доступ» */}
          <QuestionnaireRow label="Доступ">
            <Pill
              active={selectedPills["access_no"]}
              onClick={() => togglePill("access_no")}
            >
              Нет доступа
            </Pill>
          </QuestionnaireRow>

          {/* Группа «Дом (пламя)» */}
          <QuestionnaireRow label="Дом (пламя)">
            {["квартира", "балкон", "газовая колонка", "газовая плита", "лифт"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`house_flame_${item}`]}
                onClick={() => togglePill(`house_flame_${item}`)}
              >
                {item}
              </Pill>
            ))}
            <div className="w-full h-0" />
            {["мусоропровод", "подъезд", "счетчик электричества", "частный дом"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`house_flame_${item}`]}
                onClick={() => togglePill(`house_flame_${item}`)}
              >
                {item}
              </Pill>
            ))}
            <div className="w-full h-0" />
            {["электрическая проводка", "электрощит", "лестничная клетка"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`house_flame_${item}`]}
                onClick={() => togglePill(`house_flame_${item}`)}
              >
                {item}
              </Pill>
            ))}
            <div className="w-full h-0" />
            {["подвал", "дача", "сарай/бытовка/хоз. постройка"].map((item) => (
              <Pill
                key={item}
                active={selectedPills[`house_flame_${item}`]}
                onClick={() => togglePill(`house_flame_${item}`)}
              >
                {item}
              </Pill>
            ))}
            <div className="w-full h-0" />
            <Pill
              active={selectedPills["house_flame_other"]}
              onClick={() => togglePill("house_flame_other")}
            >
              прочие внутридомовые объекты
            </Pill>
          </QuestionnaireRow>
        </div>
      </div>
    </div>
  )
}
