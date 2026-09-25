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
  Wifi,
  Volume2,
  Shield,
  Sparkles,
  ArrowRight,
  UserCheck,
} from "lucide-react"

export default function StudentLobbyPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<"OPERATOR_112" | "DISPATCHER_DDS">("OPERATOR_112")
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false)

  // Try to read cadet role or preferences from localStorage if set
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRole = localStorage.getItem("cadet_role")
      if (storedRole === "DISPATCHER_DDS" || storedRole === "OPERATOR_112") {
        setSelectedRole(storedRole)
      }
    }
  }, [])

  const handleEnterSimulation = () => {
    setIsRedirecting(true)
    const targetUrl = selectedRole === "DISPATCHER_DDS" ? "/dds" : "/operator"
    if (typeof window !== "undefined") {
      localStorage.setItem("cadet_role", selectedRole)
    }
    router.push(targetUrl)
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
          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1 text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
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
                Ожидание начала урока преподавателем...
              </CardTitle>
              <CardDescription className="text-sm max-w-md mx-auto leading-relaxed">
                Преподаватель настраивает сценарий и параметры занятия. Симуляция начнется автоматически, как только урок будет запущен.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-2 pb-6 px-6">
            {/* Role switch toggle for testing */}
            <div className="p-4 rounded-xl border bg-muted/40 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Ваша учебная роль:</span>
                <span className="text-[11px] normal-case text-primary font-normal">
                  (для тестирования)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole("OPERATOR_112")}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all ${
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
                  className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all ${
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

            {/* MVP Testing Action Button */}
            <div className="pt-2 space-y-2">
              <Button
                size="lg"
                onClick={handleEnterSimulation}
                disabled={isRedirecting}
                className="w-full py-6 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all gap-2"
              >
                <Play className="h-5 w-5 fill-current" />
                <span>Войти в симуляцию (ТЕСТ)</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Переход на экран: {selectedRole === "DISPATCHER_DDS" ? "dds/page.tsx" : "operator/page.tsx"}
              </p>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/20 border-t py-3 px-6 flex justify-between items-center text-xs text-muted-foreground">
            <span>Идентификатор: cadet-terminal</span>
            <Link href="/teacher" className="hover:text-primary transition-colors">
              Перейти в кабинет преподавателя →
            </Link>
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
