import {Badge} from "@/components/ui/badge"
import {Flame, ShieldAlert, Ambulance} from "lucide-react"

export interface GroundTruth {
  fio?: string
  phone?: string
  street?: string
  house?: string
  city?: string
  apartment?: string
  floor?: string
  entrance?: string
  intercom?: string
  [key: string]: any
}

export interface DDSEtalonItem {
  service_name?: string | null
  expected_decision?: string | null
  decision_rationale?: string | null
  decision_alternatives?: string | null
  expected_stages?: string[]
  expected_result?: string | null
  required_comment_points?: string[]
  sample_comment?: string | null
  confirmation_time_limit_seconds?: number | null
}

export interface TicketItem {
  id?: string
  ticket_id: string
  display_id?: string
  sequence_number?: number
  category?: string
  subcategory?: string | null
  complexity: number
  plot: string
  etalon_services?: string[]
  factoids?: Record<string, any>
  ground_truth?: GroundTruth
  dds_etalon?: DDSEtalonItem | null
  status?: string
  workflow_state?: {
    status?: string
    [key: string]: any
  }
  created_at?: string
}

export function getTicketStatus(ticket: TicketItem): string {
  return (ticket.workflow_state?.status || ticket.status || "DRAFT").toUpperCase()
}

export const renderStatusBadge = (rawStatus?: string) => {
  const status = (rawStatus || "APPROVED").toUpperCase()
  switch (status) {
    case "DRAFT":
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-muted-foreground/40 text-muted-foreground bg-muted/20"
        >
          Черновик
        </Badge>
      )
    case "ACTIVE":
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-muted-foreground/40 text-muted-foreground bg-muted/20"
        >
          Не проверен
        </Badge>
      )
    case "UNDER_REVIEW":
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-amber-500/40 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          На проверке
        </Badge>
      )
    case "APPROVED":
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          Утвержден
        </Badge>
      )
    case "ARCHIVED":
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-slate-400/40 text-slate-500 bg-slate-100 dark:bg-slate-800/40 dark:text-slate-400"
        >
          Архивирован
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {rawStatus || "Утвержден"}
        </Badge>
      )
  }
}

export interface GenerationState {
  status: "in_progress" | "done"
  targetCount: number
  remainingSeconds: number
  startTime: number
  message?: string
}

// Format address fields safely preventing literal "null" / "undefined" strings (ТЗ 39.2)
export const formatAddressField = (val: any): string => {
  if (val == null) return ""
  const str = String(val).trim()
  return str === "null" || str === "undefined" ? "" : str
}

export const ALL_EMERGENCY_SERVICES = [
  { code: "01", name: "01 Пожарные", icon: Flame, color: "border-red-400 text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300" },
  { code: "02", name: "02 Полиция", icon: ShieldAlert, color: "border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300" },
  { code: "03", name: "03 Скорая", icon: Ambulance, color: "border-green-400 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300" },
  { code: "04", name: "04 Газ", icon: null, color: "border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
]
