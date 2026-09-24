"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  SplitScreen,
  RecordDetail,
  ErrorDetailItem,
} from "@/components/teacher/split-screen"
import {
  Users,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  BookOpen,
  Filter,
  BarChart3,
  FileText,
} from "lucide-react"

export interface CadetRecordSummary {
  record_id: string
  ticket_id?: string
  title?: string
  status: "passed" | "failed" | string
  score?: number
  is_appealed?: boolean
  teacher_comment?: string | null
  errors_count?: number
  etalon?: Record<string, any>
  student_answer?: Record<string, any>
  error_details?: ErrorDetailItem[] | Record<string, any> | string[]
}

export interface CadetSummary {
  cadet_id: string
  cadet_name: string
  success_rate: number
  records: CadetRecordSummary[]
}

export interface SessionData {
  session_id: string
  title: string
  created_at?: string
  cadets: CadetSummary[]
}

// Initial demo/fallback state for instant rendering and resilient testing
const DEFAULT_SESSION_DATA: SessionData = {
  session_id: "session-1",
  title: "Сессия аттестации: Экстренное реагирование 112",
  created_at: "2026-09-24T10:00:00Z",
  cadets: [
    {
      cadet_id: "cadet-101",
      cadet_name: "Иванов Иван Алексеевич",
      success_rate: 50,
      records: [
        {
          record_id: "rec-1",
          ticket_id: "ticket-42",
          title: "Билет №42: ДТП с пострадавшими на Ленина",
          status: "failed",
          score: 50,
          is_appealed: false,
          errors_count: 2,
          etalon: {
            caller_name: "Сергей Петрович",
            phone: "+7 (999) 111-22-33",
            address: "ул. Ленина, д. 15",
            incident_type: "ДТП с пострадавшими",
            services: ["01 (Пожарные)", "02 (Полиция)", "03 (Скорая)"],
            description: "Столкновение легкового авто и грузовика, заблокирован водитель",
          },
          student_answer: {
            caller_name: "Сергей Петрович",
            phone: "+7 (999) 111-22-33",
            address: "ул. Лермонтова, д. 15",
            incident_type: "ДТП с пострадавшими",
            services: ["02 (Полиция)"],
            description: "Авария на дороге",
          },
          error_details: [
            {
              field: "address",
              severity: "error",
              message: "Неверный адрес: указана 'ул. Лермонтова' вместо правильного 'ул. Ленина'",
            },
            {
              field: "services",
              severity: "warning",
              message: "Не все службы вызваны: '01', '03'",
            },
          ],
        },
        {
          record_id: "rec-2",
          ticket_id: "ticket-10",
          title: "Билет №10: Запах газа в подъезде",
          status: "passed",
          score: 100,
          is_appealed: false,
          errors_count: 0,
          etalon: {
            caller_name: "Мария Ивановна",
            phone: "+7 (911) 555-44-33",
            address: "пр. Мира, д. 8, под. 2",
            incident_type: "Утечка газа",
            services: ["04 (Газовая служба)"],
            description: "Сильный запах газа на 3 этаже",
          },
          student_answer: {
            caller_name: "Мария Ивановна",
            phone: "+7 (911) 555-44-33",
            address: "пр. Мира, д. 8, под. 2",
            incident_type: "Утечка газа",
            services: ["04 (Газовая служба)"],
            description: "Сильный запах газа на 3 этаже",
          },
          error_details: [],
        },
      ],
    },
    {
      cadet_id: "cadet-102",
      cadet_name: "Петрова Анна Сергеевна",
      success_rate: 100,
      records: [
        {
          record_id: "rec-3",
          ticket_id: "ticket-05",
          title: "Билет №05: Возгорание в жилом доме",
          status: "passed",
          score: 95,
          is_appealed: false,
          errors_count: 0,
          etalon: {
            caller_name: "Николай",
            phone: "+7 (900) 333-22-11",
            address: "ул. Садовая, д. 4",
            incident_type: "Пожар",
            services: ["01", "03"],
            description: "Дым из окна 2 этажа",
          },
          student_answer: {
            caller_name: "Николай",
            phone: "+7 (900) 333-22-11",
            address: "ул. Садовая, д. 4",
            incident_type: "Пожар",
            services: ["01", "03"],
            description: "Дым из окна 2 этажа",
          },
          error_details: [],
        },
      ],
    },
  ],
}

export default function AnalyticsPage() {
  const [sessionId, setSessionId] = useState<string>("session-1")
  const [sessionData, setSessionData] = useState<SessionData>(DEFAULT_SESSION_DATA)
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(
    DEFAULT_SESSION_DATA.cadets[0]?.records[0] as unknown as RecordDetail
  )
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false)
  const [isLoadingRecord, setIsLoadingRecord] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch session analytics
  const fetchSessionAnalytics = useCallback(async (sid: string) => {
    try {
      setIsLoadingSession(true)
      setErrorMessage(null)
      const res = await fetch(`/api/v1/analytics/sessions/${sid}`)
      if (res.ok) {
        const data = await res.json()
        setSessionData(data)
        // If there's an active selected record in this session, keep or select first
        const firstCadet = data.cadets?.[0]
        if (firstCadet && firstCadet.records?.length > 0) {
          const firstRec = firstCadet.records[0]
          // If first record has full etalon/student_answer, use it directly
          if (firstRec.etalon && firstRec.student_answer) {
            setSelectedRecord({
              ...firstRec,
              cadet_name: firstCadet.cadet_name,
              cadet_id: firstCadet.cadet_id,
              error_details: firstRec.error_details || [],
            } as RecordDetail)
          } else {
            // Otherwise fetch full details
            loadRecordDetail(firstRec.record_id, firstCadet.cadet_name)
          }
        }
      }
    } catch (err: any) {
      // Keep existing/default data on fetch failure
      console.warn("Could not load session from API:", err)
    } finally {
      setIsLoadingSession(false)
    }
  }, [])

  useEffect(() => {
    fetchSessionAnalytics(sessionId)
  }, [fetchSessionAnalytics, sessionId])

  // Load single record details
  const loadRecordDetail = async (recordId: string, cadetName?: string) => {
    try {
      setIsLoadingRecord(true)
      const res = await fetch(`/api/v1/analytics/records/${recordId}`)
      if (res.ok) {
        const data: RecordDetail = await res.json()
        if (cadetName && !data.cadet_name) {
          data.cadet_name = cadetName
        }
        setSelectedRecord(data)
      } else {
        // Fallback: look inside existing session records
        for (const cadet of sessionData.cadets) {
          const rec = cadet.records.find((r) => r.record_id === recordId)
          if (rec && rec.etalon && rec.student_answer) {
            setSelectedRecord({
              ...rec,
              cadet_name: cadet.cadet_name,
              cadet_id: cadet.cadet_id,
              error_details: rec.error_details || [],
            } as RecordDetail)
            break
          }
        }
      }
    } catch (err) {
      console.warn("Could not load record details from API:", err)
    } finally {
      setIsLoadingRecord(false)
    }
  }

  // Handle appeal submission
  const handleAppeal = async (recordId: string, payload: { status: string; comment: string }) => {
    const res = await fetch(`/api/v1/analytics/records/${recordId}/appeal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Ошибка при отправке апелляции (${res.status})`)
    }

    const updatedData = await res.json().catch(() => null)

    // Update selected record locally
    setSelectedRecord((prev) => {
      if (!prev) return null
      return {
        ...prev,
        status: payload.status,
        teacher_comment: payload.comment,
        is_appealed: true,
        ...(updatedData && typeof updatedData === "object" ? updatedData : {}),
      }
    })

    // Update session data and recalculate success rate for cadet
    setSessionData((prev) => {
      const updatedCadets = prev.cadets.map((cadet) => {
        const hasRecord = cadet.records.some((r) => r.record_id === recordId)
        if (!hasRecord) return cadet

        const updatedRecords = cadet.records.map((r) => {
          if (r.record_id === recordId) {
            return {
              ...r,
              status: payload.status,
              is_appealed: true,
              teacher_comment: payload.comment,
            }
          }
          return r
        })

        const passedCount = updatedRecords.filter((r) => r.status === "passed").length
        const totalCount = updatedRecords.length
        const success_rate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0

        return {
          ...cadet,
          success_rate,
          records: updatedRecords,
        }
      })

      return {
        ...prev,
        cadets: updatedCadets,
      }
    })
  }

  // Filter cadets by search
  const filteredCadets = sessionData.cadets.filter((c) =>
    c.cadet_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Журнал разбора</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Оценка результатов прошедшей сессии и ручная коррекция оценок
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            aria-label="Идентификатор сессии"
            placeholder="ID сессии..."
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="w-36 md:w-44"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSessionAnalytics(sessionId)}
            disabled={isLoadingSession}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingSession ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Main Grid: Cadets List & Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Sidebar Column: Детализация по курсантам (12 on mobile, 4-5 on desktop) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Детализация по курсантам</CardTitle>
                </div>
                <Badge variant="secondary">{filteredCadets.length} курсантов</Badge>
              </div>
              <CardDescription>
                Список курсантов с процентом успеха
              </CardDescription>

              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск курсанта..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-sm h-9"
                />
              </div>
            </CardHeader>

            <CardContent className="pt-4 px-3 space-y-3 max-h-[750px] overflow-y-auto">
              {filteredCadets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Курсанты не найдены
                </div>
              ) : (
                filteredCadets.map((cadet) => {
                  const isHighRate = cadet.success_rate >= 80
                  const isMidRate = cadet.success_rate >= 50 && cadet.success_rate < 80

                  return (
                    <div
                      key={cadet.cadet_id}
                      className="border rounded-lg p-3 bg-card hover:bg-accent/40 transition-colors space-y-2.5"
                      data-testid={`cadet-card-${cadet.cadet_id}`}
                    >
                      {/* Cadet Header */}
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm text-foreground">
                          {cadet.cadet_name}
                        </div>
                        <Badge
                          className={
                            isHighRate
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : isMidRate
                              ? "bg-amber-500 text-white hover:bg-amber-600"
                              : "bg-rose-600 text-white hover:bg-rose-700"
                          }
                          data-testid={`success-rate-${cadet.cadet_id}`}
                        >
                          {cadet.success_rate}% успеха
                        </Badge>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isHighRate
                              ? "bg-emerald-600"
                              : isMidRate
                              ? "bg-amber-500"
                              : "bg-rose-600"
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, cadet.success_rate))}%` }}
                        />
                      </div>

                      {/* Answers / Records List */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                          Ответы на билеты:
                        </span>
                        {cadet.records.map((rec) => {
                          const isSelected = selectedRecord?.record_id === rec.record_id

                          return (
                            <button
                              key={rec.record_id}
                              type="button"
                              onClick={() => {
                                if (rec.etalon && rec.student_answer) {
                                  setSelectedRecord({
                                    ...rec,
                                    cadet_name: cadet.cadet_name,
                                    cadet_id: cadet.cadet_id,
                                    error_details: rec.error_details || [],
                                  } as RecordDetail)
                                } else {
                                  loadRecordDetail(rec.record_id, cadet.cadet_name)
                                }
                              }}
                              className={`w-full text-left p-2 rounded-md border text-xs flex items-center justify-between transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-medium"
                                  : "border-border/70 hover:border-primary/50 bg-background hover:bg-muted/40"
                              }`}
                              data-testid={`record-item-${rec.record_id}`}
                            >
                              <div className="truncate pr-2">
                                <div className="font-medium text-foreground truncate">
                                  {rec.title || `Ответ #${rec.record_id}`}
                                </div>
                                <div className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                  <span>{rec.status === "passed" ? "Зачтено" : "Не зачтено"}</span>
                                  {rec.is_appealed && (
                                    <span className="text-purple-600 dark:text-purple-400 font-semibold">
                                      • Апелляция
                                    </span>
                                  )}
                                  {rec.errors_count !== undefined && rec.errors_count > 0 && (
                                    <span className="text-rose-500">
                                      • Ошибок: {rec.errors_count}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Сплит-скрин карточки (12 on mobile, 7-8 on desktop) */}
        <div className="lg:col-span-8">
          {selectedRecord ? (
            <SplitScreen
              record={selectedRecord}
              onAppeal={handleAppeal}
              onClose={() => setSelectedRecord(null)}
            />
          ) : (
            <Card className="h-full flex items-center justify-center p-12 text-center text-muted-foreground border-dashed">
              <div className="space-y-3 max-w-sm">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/60" />
                <h3 className="font-semibold text-lg text-foreground">Ответ не выбран</h3>
                <p className="text-sm">
                  Выберите ответ курсанта из списка слева, чтобы открыть сплит-скрин карточки и правильного образца.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
