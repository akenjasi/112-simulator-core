"use client"

import { X } from "lucide-react"
import { IncidentClassifier } from "./IncidentClassifier"

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
  selectedPills?: Record<string, boolean>
  togglePill?: (id: string) => void
  topStatuses: Record<string, boolean>
  toggleTopStatus: (id: string) => void
  onNoContact?: () => void
  onCallDropped?: () => void
  onAddIncidentType?: () => void
  onCloseIncident?: () => void
  activeIncidentTitle?: string | null
  incidentType?: string | null
  onSelectType?: (type: string | null) => void
  onAggregatedUpdate?: (text: string) => void
  onRecommendedServices?: (services: string[]) => void
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
  activeIncidentTitle = null,
  incidentType = null,
  onSelectType,
  onAggregatedUpdate,
  onRecommendedServices,
}: Props) {
  const currentIncidentType = incidentType ?? activeIncidentTitle ?? null

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

      {/* 2. Карточка классификатора происшествия (Inline выбор и опросник) */}
      <div style={{ border: `1px solid ${border}` }} className="flex-1 flex flex-col min-h-0 p-3 bg-white overflow-y-auto">
        <IncidentClassifier
          incidentType={currentIncidentType}
          onSelectType={onSelectType}
          onAggregatedUpdate={onAggregatedUpdate || (() => {})}
          onRecommendedServices={onRecommendedServices}
        />
      </div>
    </div>
  )
}
