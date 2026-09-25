"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Headphones,
  Radio,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  Sparkles,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"

export default function StudentLobbyPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<"OPERATOR_112" | "DISPATCHER_DDS">("OPERATOR_112")
  const [isStartingDemo, setIsStartingDemo] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Try to read cadet role from localStorage if set
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRole = localStorage.getItem("cadet_role")
      if (storedRole === "DISPATCHER_DDS" || storedRole === "OPERATOR_112") {
        setSelectedRole(storedRole)
      }
    }
  }, [])

  // Call POST /api/v1/sessions/demo and redirect
  const handleDemoLaunch = async () => {
    setIsStartingDemo(true)
    setErrorMessage(null)

    if (typeof window !== "undefined") {
      localStorage.setItem("cadet_role", selectedRole)
    }

    try {
      const response = await fetch("/api/v1/sessions/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_role: selectedRole,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const detail = errorData.detail || "Не удалось инициализировать демо-сессию."
        throw new Error(detail)
      }

      const data = await response.json()
      const targetUrl =
        data.redirect_url ||
        (selectedRole === "DISPATCHER_DDS"
          ? `/dds?session_id=${data.session_id}&ticket_id=${data.ticket_id}`
          : `/operator?session_id=${data.session_id}&ticket_id=${data.ticket_id}`)

      // Perform redirect
      router.push(targetUrl)
    } catch (err: any) {
      console.error("Ошибка при демо-запуске:", err)
      setErrorMessage(
        err.message ||
          "Не удалось запустить демо-сессию. Убедитесь, что сервер запущен и в базе присутствуют билеты."
      )
      setIsStartingDemo(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-900 flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md font-bold text-lg">
            112
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">
              Тренажер Системы-112
            </h1>
            <p className="text-xs text-muted-foreground">
              Терминал курсанта • Лобби ожидания
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/student/profile">
            <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
              <User className="h-3.5 w-3.5" />
              <span>Личный кабинет</span>
            </Button>
          </Link>

          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1.5 text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold hidden sm:flex"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Сервер подключен</span>
          </Badge>
        </div>
      </header>

      {/* Main Center Waiting Card */}
      <main className="max-w-xl w-full mx-auto my-8">
        <Card className="border-2 border-primary/20 shadow-xl overflow-hidden backdrop-blur-xs bg-card/95">
          {/* Top Decorative Banner */}
          <div className="h-2 bg-gradient-to-r from-blue-500 via-primary to-emerald-500" />

          <CardHeader className="text-center pt-8 pb-4 space-y-4">
            {/* Pulsing Sonar / Radar Animation */}
            <div className="relative mx-auto flex items-center justify-center w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full bg-primary/15 animate-pulse" />
              <div className="relative z-10 w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                {selectedRole === "OPERATOR_112" ? (
                  <Headphones className="h-8 w-8 animate-pulse" />
                ) : (
                  <Radio className="h-8 w-8 animate-pulse" />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                Ожидание старта. Преподаватель подготавливает занятие...
              </CardTitle>
              <CardDescription className="text-sm max-w-md mx-auto leading-relaxed">
                Сценарий и параметры симуляции будут загружены автоматически. Либо воспользуйтесь режимом «Демо-запуск» для самостоятельной тренировки.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-2 pb-6 px-6">
            {/* Role switch toggle for testing / demo */}
            <div className="p-4 rounded-xl border bg-muted/40 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Целевая учебная роль:</span>
                <span className="text-[11px] normal-case text-primary font-normal">
                  (для демо-запуска)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole("OPERATOR_112")}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedRole === "OPERATOR_112"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-bold"
                      : "border-border/70 hover:bg-muted/60 opacity-80"
                  }`}
                >
                  <Headphones className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Оператор 112</div>
                    <div className="text-[11px] text-muted-foreground">Прием звонков</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole("DISPATCHER_DDS")}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedRole === "DISPATCHER_DDS"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-bold"
                      : "border-border/70 hover:bg-muted/60 opacity-80"
                  }`}
                >
                  <Radio className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Диспетчер ДДС</div>
                    <div className="text-[11px] text-muted-foreground">Направление служб</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Ошибка демо-запуска</div>
                  <div>{errorMessage}</div>
                </div>
              </div>
            )}

            {/* Diagnostics checklist */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 px-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Канал связи</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium border-x">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Аудиосистема</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Классификатор</span>
              </div>
            </div>

            {/* Accent Demo Launch Action Button */}
            <div className="pt-2 space-y-2">
              <Button
                size="lg"
                onClick={handleDemoLaunch}
                disabled={isStartingDemo}
                className="w-full py-6 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all gap-2 cursor-pointer"
              >
                {isStartingDemo ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Инициализация сессии...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current" />
                    <span>Демо-запуск ({selectedRole === "DISPATCHER_DDS" ? "ДДС" : "112"})</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Переход на рабочее место:{" "}
                <span className="font-semibold text-foreground">
                  {selectedRole === "DISPATCHER_DDS" ? "Диспетчер ДДС (/dds)" : "Оператор 112 (/operator)"}
                </span>
              </p>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/20 border-t py-3 px-6 flex justify-between items-center text-xs text-muted-foreground">
            <span>Идентификатор: cadet-terminal</span>
            <div className="flex items-center gap-4">
              <Link href="/student/profile" className="hover:text-primary transition-colors font-medium">
                Личный кабинет →
              </Link>
              <Link href="/teacher" className="hover:text-primary transition-colors">
                Преподаватель →
              </Link>
            </div>
          </CardFooter>
        </Card>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto text-center text-xs text-muted-foreground border-t pt-4">
        Автоматизированный программный комплекс подготовки специалистов экстренных оперативных служб
      </footer>
    </div>
  )
}
