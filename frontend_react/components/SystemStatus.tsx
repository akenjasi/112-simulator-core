import React from "react"
import { Activity } from "lucide-react"
import type { SystemStatusState } from "@/hooks/useSystemStatus"

export interface SystemStatusProps {
  status: SystemStatusState
  variant?: "admin" | "teacher"
  className?: string
}

const STATUS_CONFIG: Record<
  SystemStatusState,
  { text: string; dotColor: string; iconColor: string }
> = {
  checking: {
    text: "Проверка системы…",
    dotColor: "bg-slate-400",
    iconColor: "text-slate-400",
  },
  active: {
    text: "Система активна",
    dotColor: "bg-emerald-500",
    iconColor: "text-emerald-600",
  },
  down: {
    text: "Система недоступна",
    dotColor: "bg-red-500",
    iconColor: "text-red-500",
  },
}

export function SystemStatus({
  status,
  variant = "admin",
  className = "",
}: SystemStatusProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.checking

  if (variant === "teacher") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`p-3 bg-white border-2 border-[#c9ced1] rounded-xl flex items-center gap-3 ${className}`}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full ${config.dotColor} animate-pulse shrink-0`}
        />
        <div className="text-sm font-bold text-[#49555d]">
          {config.text}
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-3 h-3 rounded-full ${config.dotColor} animate-pulse shrink-0`}
        />
        <div className="text-xs font-bold text-slate-700">
          {config.text}
        </div>
      </div>
      <Activity className={`w-4 h-4 ${config.iconColor}`} />
    </div>
  )
}

export default SystemStatus
