"use client"

import { Phone, X, Plus, Link2, Timer, Bell, MessageSquare } from "lucide-react"

const orange = "#ec653b"

export type OperatorService = {
  id: string
  name: string
  shortName?: string
  isGray?: boolean
}

type Props = {
  services: OperatorService[]
  onRemoveService: (id: string) => void
  onAddService: () => void
  onSave: () => void
  onOpenLinks?: () => void
  onOpenTimer?: () => void
  onOpenAlerts?: () => void
  onOpenChat?: () => void
  onCloseCard?: () => void
  onSelectService?: (service: OperatorService) => void
}

function ServiceTab({
  service,
  onRemove,
  onClick,
}: {
  service: OperatorService
  onRemove: (id: string) => void
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col justify-between px-3 py-1.5 select-none transition-all rounded-[1px] cursor-pointer hover:brightness-105 shrink-0"
      style={{
        background: service.isGray ? "#8a9298" : "#e2572c",
        minWidth: 135,
        maxWidth: 185,
        minHeight: 48,
      }}
      title={`Служба реагирования: ${service.name}`}
    >
      <div className="flex items-center justify-between text-white w-full">
        <Phone size={13} className="shrink-0" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(service.id)
          }}
          className="text-white/80 hover:text-white hover:bg-black/20 p-0.5 rounded transition-colors cursor-pointer"
          title={`Удалить службу ${service.name}`}
          aria-label={`Удалить ${service.name}`}
        >
          <X size={13} />
        </button>
      </div>
      <span className="text-[12px] 2xl:text-[13px] font-semibold text-white truncate leading-snug mt-0.5">
        {service.shortName || service.name}
      </span>
    </div>
  )
}

function ActionIconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode
  title: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center text-white hover:bg-white/15 active:scale-95 transition-all cursor-pointer rounded-[1px] shrink-0"
      style={{ width: 40, height: 40, border: "1px solid rgba(255,255,255,0.75)" }}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

export function OperatorBottomBar({
  services,
  onRemoveService,
  onAddService,
  onSave,
  onOpenLinks,
  onOpenTimer,
  onOpenAlerts,
  onOpenChat,
  onCloseCard,
  onSelectService,
}: Props) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 select-none shrink-0"
      style={{
        background: orange,
        minHeight: 64,
        boxShadow: "0 -2px 6px rgba(0,0,0,0.08)",
      }}
    >
      {/* 1. Заголовок "Службы:" */}
      <div className="flex items-center text-[13px] 2xl:text-[14px] font-bold text-white pr-1 shrink-0">
        Службы:
      </div>

      {/* 2. Список назначенных служб (просторный, с возможностью горизонтальной прокрутки) */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-[65vw]">
        {services.map((svc) => (
          <ServiceTab
            key={svc.id}
            service={svc}
            onRemove={onRemoveService}
            onClick={() => onSelectService?.(svc)}
          />
        ))}
      </div>

      {/* 3. Кнопка добавления службы [+] */}
      <button
        type="button"
        onClick={onAddService}
        className="flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer rounded-[1px] shrink-0"
        style={{
          width: 52,
          height: 48,
          border: "1px solid rgba(255,255,255,0.75)",
        }}
        title="Добавить службу экстренного реагирования"
        aria-label="добавить службу"
      >
        <Plus size={22} />
      </button>

      <div className="flex-1 min-w-2" />

      {/* 4. Большая контрастная кнопка [сохранить] */}
      <button
        type="button"
        onClick={onSave}
        className="flex items-center justify-center text-[16px] font-bold text-white px-8 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md rounded-[1px] shrink-0"
        style={{
          background: "#d64e23",
          height: 48,
        }}
        title="Сохранить карточку вызова и передать службам"
      >
        сохранить
      </button>

      {/* 5. Системные иконки */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled
          className="flex items-center justify-center text-white cursor-not-allowed opacity-50 rounded-[1px] shrink-0"
          style={{ width: 40, height: 40, border: "1px solid rgba(255,255,255,0.75)" }}
          title="Недоступно в тренажере. Функция служит для поиска и связывания дубликатов карточек"
          aria-label="Связи и дубли происшествия"
        >
          <Link2 size={17} />
        </button>
        <ActionIconBtn title="Хронометраж и таймер этапов вызова" onClick={onOpenTimer}>
          <Timer size={17} />
        </ActionIconBtn>
        <ActionIconBtn title="Оперативные оповещения дежурного" onClick={onOpenAlerts}>
          <Bell size={17} />
        </ActionIconBtn>
        <button
          type="button"
          disabled
          className="flex items-center justify-center text-white cursor-not-allowed opacity-50 rounded-[1px] shrink-0"
          style={{ width: 40, height: 40, border: "1px solid rgba(255,255,255,0.75)" }}
          title="Недоступно в тренажере. В реальности используется для связи со старшим смены."
          aria-label="Служебный чат смены"
        >
          <MessageSquare size={17} />
        </button>
        <button
          type="button"
          disabled
          className="flex items-center justify-center text-white cursor-not-allowed opacity-50 rounded-[1px] shrink-0"
          style={{ width: 40, height: 40, border: "1px solid rgba(255,255,255,0.75)" }}
          title="В учебном режиме вызов должен быть отработан до конца. Воспользуйтесь кнопкой 'Сохранить'"
          aria-label="Закрыть карточку вызова"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  )
}
