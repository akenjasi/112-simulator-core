"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ShieldCheck,
  KeyRound,
  User,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Smartphone,
  Shield,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()

  // Form states
  const [step, setStep] = useState<"credentials" | "2fa">("credentials")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("ADMIN")
  const [totpCode, setTotpCode] = useState("")
  const [userId, setUserId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          role,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Ошибка авторизации. Проверьте данные.")
      }

      if (data.requires_2fa) {
        // Switch to TOTP 2FA step
        setUserId(data.user_id)
        setStep("2fa")
        setLoading(false)
        return
      }

      // Normal login success
      onLoginSuccess(data)
    } catch (err: any) {
      setError(err.message || "Не удалось войти в систему")
      setLoading(false)
    }
  }

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          username: username.trim(),
          code: totpCode.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Неверный код подтверждения 2FA")
      }

      onLoginSuccess(data)
    } catch (err: any) {
      setError(err.message || "Ошибка проверки двухфакторного кода")
      setLoading(false)
    }
  }

  const onLoginSuccess = (data: any) => {
    // Save token and user details to localStorage
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token)
      localStorage.setItem("token", data.access_token)
    }
    if (data.role) {
      localStorage.setItem("user_role", data.role)
      localStorage.setItem("role", data.role)
    }
    if (data.username) {
      localStorage.setItem("username", data.username)
    }
    if (data.user_id) {
      localStorage.setItem("user_id", data.user_id)
    }

    // Set authorization cookie for middleware / server components if used
    if (data.access_token) {
      document.cookie = `access_token=${data.access_token}; path=/; max-age=86400; SameSite=Lax`
      document.cookie = `token=${data.access_token}; path=/; max-age=86400; SameSite=Lax`
    }

    // Redirect to corresponding dashboard
    const userRole = (data.role || role || "").toUpperCase()
    if (userRole === "ADMIN") {
      router.push("/admin")
    } else if (userRole === "TEACHER") {
      router.push("/teacher/sessions")
    } else {
      router.push("/student/profile")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col justify-center items-center p-4">
      {/* Brand header */}
      <div className="mb-8 text-center flex flex-col items-center">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-md group-hover:scale-105 transition-transform">
            112
          </div>
          <div className="text-left">
            <span className="font-extrabold tracking-tight text-xl block text-slate-900 dark:text-slate-50">
              Система-112
            </span>
            <span className="text-xs text-muted-foreground block -mt-1">
              Учебный тренажерный комплекс
            </span>
          </div>
        </Link>
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/80 bg-card/95 backdrop-blur-sm">
        {step === "credentials" ? (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Вход в систему</CardTitle>
              <CardDescription>
                Введите учетные данные для доступа к платформе тренажера
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleCredentialsSubmit}>
              <CardContent className="space-y-4 pt-2">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Роль пользователя
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "ADMIN", label: "Админ" },
                      { id: "TEACHER", label: "Преподаватель" },
                      { id: "CADET", label: "Курсант" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRole(item.id)}
                        className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                          role === item.id
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">Имя пользователя / Логин</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      required
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">Пароль</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Проверка...
                    </>
                  ) : (
                    <>
                      Войти
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-between w-full text-xs text-muted-foreground pt-2">
                  <Link href="/" className="hover:underline flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> На главную
                  </Link>
                  <span className="text-muted-foreground/60">Демо: demo / demo</span>
                </div>
              </CardFooter>
            </form>
          </>
        ) : (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                <Smartphone className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Двухфакторная защита</CardTitle>
              <CardDescription>
                Для аккаунта <strong>{username}</strong> включена 2FA. Введите 6-значный код из Google Authenticator.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handle2FASubmit}>
              <CardContent className="space-y-4 pt-2">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2 text-center">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Код подтверждения (TOTP)
                  </label>
                  <div className="relative max-w-xs mx-auto">
                    <KeyRound className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      required
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="pl-10 text-center tracking-[0.5em] text-2xl font-mono h-12 font-bold"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Код обновляется каждые 30 секунд в приложении аутентификатора
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={loading || totpCode.length < 6}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Проверка кода...
                    </>
                  ) : (
                    <>
                      Подтвердить вход
                      <Shield className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials")
                    setTotpCode("")
                    setError(null)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 mt-1 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Назад к вводу логина и пароля
                </button>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
