"use client"

import { PhoneOff, MessageSquare, HelpCircle, MapPin, Globe } from "lucide-react"

const border = "#c9ced1"
const slate = "#49555d"

function PhoneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={slate} aria-hidden="true">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1L6.6 10.8z" />
    </svg>
  )
}

function MsgBox({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center transition-colors hover:bg-gray-100 cursor-pointer active:scale-95"
      style={{ width: 26, height: 22, border: `1px solid ${border}`, background: "#fbfdfe" }}
      aria-label="Сообщение"
      title="Отправить служебное сообщение / SMS"
    >
      <MessageSquare size={13} color={slate} />
    </button>
  )
}

function AonBox({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Скопировать номер из АОН"
      className="flex items-center justify-center text-[11px] font-semibold select-none hover:bg-gray-100 cursor-pointer active:scale-95 transition-colors"
      style={{ padding: "1px 6px", border: `1px solid ${border}`, background: "#fbfdfe", color: slate }}
    >
      АОН
    </button>
  )
}

type Props = {
  elapsedSeconds: number
  aonPhone?: string
  providedPhone?: string
  onSitePhone?: string
  incidentNumber?: string
  operatorInfo?: string
  onHangup?: () => void
  onCallRecords?: () => void
  onSmsList?: () => void
  onOpenMsg?: () => void
  onAonInfo?: () => void
  onMapInfo?: () => void
  onProviderInfo?: () => void
  onCopyAonToProvided?: () => void
  onCopyAonToOnSite?: () => void
}

export function OperatorTopBar({
  elapsedSeconds = 16,
  aonPhone = "+7 ( )  - -",
  providedPhone = "+7 ( )  - -",
  onSitePhone = "+7 ( )  - -",
  incidentNumber = "913126",
  operatorInfo = "Опер. 1002, АРМ 7, Системны...",
  onHangup,
  onCallRecords,
  onSmsList,
  onOpenMsg,
  onAonInfo,
  onMapInfo,
  onProviderInfo,
  onCopyAonToProvided,
  onCopyAonToOnSite,
}: Props) {
  const pad = (n: number) => String(n).padStart(2, "0")
  const mins = pad(Math.floor(elapsedSeconds / 60))
  const secs = pad(elapsedSeconds % 60)

  return (
    <div className="flex items-stretch select-none shrink-0" style={{ background: "#fbfdfe", borderBottom: `1px solid ${border}`, height: 56 }}>
      {/* 1. Hang up / Телефонная трубка отбоя */}
      <div className="flex items-center justify-center px-4" style={{ minWidth: 64 }}>
        <button
          type="button"
          aria-label="Положить трубку"
          className="hover:opacity-75 transition-opacity cursor-pointer p-1 rounded active:scale-95"
          onClick={onHangup}
          title="Завершить вызов"
        >
          <PhoneOff size={28} color={slate} strokeWidth={1.5} />
        </button>
      </div>

      {/* 2. Не подключен + системные кнопки */}
      <div
        className="flex flex-col justify-center gap-1 px-3 py-1.5"
        style={{ borderLeft: `1px solid ${border}`, minWidth: 230 }}
      >
        <span className="text-[12px] leading-tight font-medium" style={{ color: slate }}>
          не подключен
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCallRecords}
            className="text-[11px] hover:bg-gray-100 transition-colors cursor-pointer active:scale-95"
            style={{ padding: "3px 8px", border: `1px solid ${border}`, background: "#fbfdfe", color: slate }}
          >
            записи звонков
          </button>
          <button
            type="button"
            onClick={onSmsList}
            className="text-[11px] hover:bg-gray-100 transition-colors cursor-pointer active:scale-95"
            style={{ padding: "3px 8px", border: `1px solid ${border}`, background: "#fbfdfe", color: slate }}
          >
            список SMS
          </button>
          <MsgBox onClick={onOpenMsg} />
        </div>
      </div>

      {/* 3. Телефонный слот: АОН */}
      <div className="flex-1 basis-0 min-w-0 flex items-stretch" style={{ borderLeft: `1px solid ${border}` }}>
        <div className="flex items-center px-2">
          <PhoneGlyph />
        </div>
        <div className="flex flex-col justify-center gap-0.5 py-1.5 pr-3 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] truncate font-medium" style={{ color: slate }}>
              АОН
            </span>
            <div className="flex items-center gap-1.5 pl-2" style={{ color: "#8a949b" }}>
              <HelpCircle
                size={13}
                onClick={onAonInfo}
                className="hover:text-blue-500 cursor-pointer transition-colors"
                title="Справка по определению номера АОН"
              />
              <MapPin
                size={13}
                onClick={onMapInfo}
                className="hover:text-blue-500 cursor-pointer transition-colors"
                fill="currentColor"
                strokeWidth={0}
                title="Определение местоположения базовой станции"
              />
              <Globe
                size={13}
                onClick={onProviderInfo}
                className="hover:text-blue-500 cursor-pointer transition-colors"
                title="Данные оператора связи"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[17px] leading-none font-medium tabular-nums" style={{ color: slate }}>
              {aonPhone}
            </span>
            <MsgBox onClick={onOpenMsg} />
          </div>
        </div>
      </div>

      {/* 4. Телефонный слот: предоставленный */}
      <div className="flex-1 basis-0 min-w-0 flex items-stretch" style={{ borderLeft: `1px solid ${border}` }}>
        <div className="flex items-center px-2">
          <PhoneGlyph />
        </div>
        <div className="flex flex-col justify-center gap-0.5 py-1.5 pr-3 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] truncate font-medium" style={{ color: slate }}>
              предоставленный
            </span>
            <div className="flex items-center gap-1.5 pl-2" style={{ color: "#8a949b" }}>
              <Globe
                size={13}
                onClick={onProviderInfo}
                className="hover:text-blue-500 cursor-pointer transition-colors"
                title="Данные оператора связи"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[17px] leading-none font-medium tabular-nums" style={{ color: slate }}>
              {providedPhone}
            </span>
            <div className="flex items-center gap-1.5">
              <AonBox onClick={onCopyAonToProvided} />
              <MsgBox onClick={onOpenMsg} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Телефонный слот: телефон на место (БЕЗ MsgBox по регламенту) */}
      <div className="flex-1 basis-0 min-w-0 flex items-stretch" style={{ borderLeft: `1px solid ${border}` }}>
        <div className="flex items-center px-2">
          <PhoneGlyph />
        </div>
        <div className="flex flex-col justify-center gap-0.5 py-1.5 pr-3 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] truncate font-medium" style={{ color: slate }}>
              телефон на место
            </span>
            <div className="flex items-center gap-1.5 pl-2" style={{ color: "#8a949b" }}>
              <Globe
                size={13}
                onClick={onProviderInfo}
                className="hover:text-blue-500 cursor-pointer transition-colors"
                title="Данные оператора связи"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[17px] leading-none font-medium tabular-nums" style={{ color: slate }}>
              {onSitePhone}
            </span>
            <div className="flex items-center gap-1.5">
              <AonBox onClick={onCopyAonToOnSite} />
            </div>
          </div>
        </div>
      </div>

      {/* 6. Блок происшествия */}
      <div
        className="flex flex-col justify-center gap-0.5 px-3 py-1.5"
        style={{ borderLeft: `1px solid ${border}`, minWidth: 230 }}
      >
        <span className="text-[14px] font-bold" style={{ color: "#303335" }}>
          Происшествие {incidentNumber}
        </span>
        <span className="text-[11px] leading-tight" style={{ color: slate }}>
          Сохр. 19.12.2022 в 09:04:37
        </span>
        <span className="text-[11px] truncate leading-tight" style={{ color: slate }}>
          {operatorInfo}
        </span>
      </div>

      {/* 7. Черный таймер разговора */}
      <div
        className="flex flex-col items-center justify-center px-4"
        style={{ background: "#303335", minWidth: 90 }}
      >
        <span className="text-[26px] font-bold leading-none text-white tabular-nums tracking-wider">
          {mins}:{secs}
        </span>
        <div className="flex w-full justify-between text-[9px] text-white/70 mt-1 px-1">
          <span>минут</span>
          <span>секунд</span>
        </div>
      </div>
    </div>
  )
}
