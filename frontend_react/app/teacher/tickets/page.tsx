"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  X,
  FileCheck2,
  ShieldAlert,
  Flame,
  Ambulance,
  Phone,
  MapPin,
  User,
  Info,
} from "lucide-react"

export interface GroundTruth {
  fio?: string
  phone?: string
  street?: string
  house?: string
  city?: string
  [key: string]: any
}

export interface TicketItem {
  ticket_id: string
  complexity: number
  plot: string
  etalon_services: string[]
  factoids?: Record<string, any>
  ground_truth?: GroundTruth
  status?: string
  created_at?: string
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [count, setCount] = useState<number>(50)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isApproving, setIsApproving] = useState<boolean>(false)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPackageApproved, setIsPackageApproved] = useState<boolean>(false)

  // Fetch ticket list from backend
  const loadTickets = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/v1/tickets")
      if (!res.ok) {
        throw new Error(`Ошибка загрузки списка билетов (${res.status})`)
      }
      const data = await res.json()
      const ticketList: TicketItem[] = Array.isArray(data) ? data : []
      setTickets(ticketList)

      // Check if all are already approved
      if (ticketList.length > 0 && ticketList.every((t) => t.status === "approved")) {
        setIsPackageApproved(true)
      } else {
        setIsPackageApproved(false)
      }
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить список билетов")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  // Handle ticket generation
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!count || count < 1) {
      setError("Количество билетов должно быть не менее 1")
      return
    }

    try {
      setIsGenerating(true)
      setError(null)
      setSuccessMessage(null)

      const res = await fetch("/api/v1/tickets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: Number(count) }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Не удалось сгенерировать билеты (${res.status})`)
      }

      const generatedData = await res.json()
      const newTickets: TicketItem[] = Array.isArray(generatedData) ? generatedData : []
      setTickets(newTickets)
      setIsPackageApproved(false)
      setSuccessMessage(`Пакет из ${newTickets.length || count} билетов успешно сгенерирован!`)
    } catch (err: any) {
      setError(err.message || "Ошибка при генерации билетов")
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle batch approval
  const handleApprovePackage = async () => {
    try {
      setIsApproving(true)
      setError(null)
      setSuccessMessage(null)

      const res = await fetch("/api/v1/tickets/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok && res.status !== 404) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Ошибка утверждения пакета (${res.status})`)
      }

      // Mark all tickets as approved locally
      setTickets((prev) =>
        prev.map((t) => ({
          ...t,
          status: "approved",
        }))
      )
      setIsPackageApproved(true)
      setSuccessMessage("Пакет билетов успешно утвержден!")
    } catch (err: any) {
      setError(err.message || "Ошибка утверждения пакета билетов")
    } finally {
      setIsApproving(false)
    }
  }

  // Visual complexity badge renderer: 1 -> Green, 2 -> Yellow, 3 -> Red
  const renderComplexityBadge = (complexity: number) => {
    switch (complexity) {
      case 1:
        return (
          <Badge
            data-testid="complexity-badge-1"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium border-emerald-700/30"
          >
            Сложность 1 (Зеленый)
          </Badge>
        )
      case 2:
        return (
          <Badge
            data-testid="complexity-badge-2"
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium border-amber-600/30"
          >
            Сложность 2 (Желтый)
          </Badge>
        )
      case 3:
      default:
        return (
          <Badge
            data-testid="complexity-badge-3"
            variant="destructive"
            className="bg-rose-600 hover:bg-rose-700 text-white font-medium border-rose-700/30"
          >
            Сложность 3 (Красный)
          </Badge>
        )
    }
  }

  // Emergency service badge
  const renderServiceBadge = (code: string) => {
    switch (code) {
      case "01":
        return (
          <Badge key={code} variant="outline" className="border-red-400 text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300">
            <Flame className="w-3 h-3 mr-1 inline" /> 01 Пожарные
          </Badge>
        )
      case "02":
        return (
          <Badge key={code} variant="outline" className="border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300">
            <ShieldAlert className="w-3 h-3 mr-1 inline" /> 02 Полиция
          </Badge>
        )
      case "03":
        return (
          <Badge key={code} variant="outline" className="border-green-400 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300">
            <Ambulance className="w-3 h-3 mr-1 inline" /> 03 Скорая
          </Badge>
        )
      case "04":
        return (
          <Badge key={code} variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300">
            04 Газ
          </Badge>
        )
      default:
        return (
          <Badge key={code} variant="outline">
            {code}
          </Badge>
        )
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <Ticket className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              База билетов
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Генерация учебных сценариев с помощью алгоритмического рандомизатора и формирование экзаменационных пакетов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPackageApproved && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-950/50 dark:text-green-300 px-3 py-1">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Пакет утвержден
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadTickets}
            disabled={isLoading || isGenerating}
            title="Обновить список билетов"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Generation Panel */}
      <Card className="shadow-sm border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl">Панель генерации</CardTitle>
          </div>
          <CardDescription>
            Задайте размер пакета и запустите алгоритмический рандомизатор для формирования учебных билетов.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row items-end gap-4">
            <div className="space-y-1.5 w-full sm:w-64">
              <Label htmlFor="ticket-count-input">
                Количество <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ticket-count-input"
                name="count"
                aria-label="Количество"
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="50"
                disabled={isGenerating}
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isGenerating}
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Генерация пакета...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Сгенерировать пакет
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Ticket List Dashboard */}
      <Card className="shadow-sm border">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Список билетов</CardTitle>
            <CardDescription>
              Всего билетов в текущем пакете: {tickets.length}
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant={isPackageApproved ? "secondary" : "default"}
              onClick={handleApprovePackage}
              disabled={isApproving || tickets.length === 0}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Утверждение...
                </>
              ) : (
                <>
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Утвердить пакет
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Загрузка билетов...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
              <Ticket className="h-10 w-10 text-muted-foreground/60 mb-2" />
              <h3 className="font-semibold text-lg">Билеты еще не сгенерированы</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Укажите необходимое количество в панели генерации выше и нажмите «Сгенерировать пакет».
              </p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">ID билета</TableHead>
                    <TableHead className="w-[180px]">Сложность</TableHead>
                    <TableHead>Фабула инцидента</TableHead>
                    <TableHead className="w-[160px]">Службы</TableHead>
                    <TableHead className="w-[200px]">Заявитель / Адрес</TableHead>
                    <TableHead className="w-[110px] text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket, index) => {
                    const shortId = ticket.ticket_id ? ticket.ticket_id.slice(0, 8) : `#${index + 1}`
                    const fio = ticket.ground_truth?.fio || "—"
                    const address = [ticket.ground_truth?.street, ticket.ground_truth?.house]
                      .filter(Boolean)
                      .join(", ")

                    return (
                      <TableRow key={ticket.ticket_id || index}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {shortId}
                        </TableCell>
                        <TableCell>
                          {renderComplexityBadge(ticket.complexity)}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="line-clamp-2 text-sm text-foreground">
                            {ticket.plot || (ticket.factoids && Object.values(ticket.factoids)[0]) || "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {ticket.etalon_services && ticket.etalon_services.length > 0 ? (
                              ticket.etalon_services.map((code) => renderServiceBadge(code))
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            <div className="font-medium text-foreground">{fio}</div>
                            {address && <div className="text-muted-foreground">{address}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTicket(ticket)}
                            aria-label={`Детали билета ${shortId}`}
                          >
                            <Eye className="h-4 w-4 mr-1 sm:inline hidden" />
                            Детали
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-background border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="ticket-modal-title" className="text-xl font-bold text-foreground">
                    Детали билета #{selectedTicket.ticket_id.slice(0, 8)}
                  </h2>
                  {renderComplexityBadge(selectedTicket.complexity)}
                </div>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                  ID: {selectedTicket.ticket_id}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTicket(null)}
                aria-label="Dismiss"
                data-testid="modal-dismiss-btn"
                className="rounded-full w-8 h-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Situation / Plot */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-primary" /> Фабула вызова / Сценарий
                </Label>
                <div className="p-3.5 rounded-lg bg-muted/40 border text-sm leading-relaxed text-foreground">
                  {selectedTicket.plot || (selectedTicket.factoids && Object.values(selectedTicket.factoids)[0]) || "Текст сценария отсутствует"}
                </div>
              </div>

              {/* Etalon Services */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Назначенные службы экстренного реагирования</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedTicket.etalon_services && selectedTicket.etalon_services.length > 0 ? (
                    selectedTicket.etalon_services.map((code) => renderServiceBadge(code))
                  ) : (
                    <span className="text-sm text-muted-foreground">Службы не назначены</span>
                  )}
                </div>
              </div>

              {/* Ground Truth Data */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Эталонные данные абонента (Ground Truth)</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/30 border">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Заявитель:</span>
                      <span className="text-sm font-medium">
                        {selectedTicket.ground_truth?.fio || "Не указан"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Телефон:</span>
                      <span className="text-sm font-medium font-mono">
                        {selectedTicket.ground_truth?.phone || "Не указан"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Адрес происшествия:</span>
                      <span className="text-sm font-medium">
                        {[
                          selectedTicket.ground_truth?.city,
                          selectedTicket.ground_truth?.street ? `ул. ${selectedTicket.ground_truth.street}` : null,
                          selectedTicket.ground_truth?.house ? `д. ${selectedTicket.ground_truth.house}` : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Адрес не указан"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Factoids if present */}
              {selectedTicket.factoids && Object.keys(selectedTicket.factoids).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Дополнительные фактоиды</Label>
                  <div className="text-xs space-y-1 bg-muted/20 p-3 rounded border">
                    {Object.entries(selectedTicket.factoids).map(([key, val]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-mono text-muted-foreground">{key}:</span>
                        <span>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
