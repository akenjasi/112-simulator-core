"use client"

import { ThemeSelect } from "@/components/theme-select"

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

async function readAuthResponse(res: Response, fallback: string) {
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(res.status >= 500
      ? "Сервис временно недоступен. Повторите вход через несколько секунд."
      : "Сервер вернул некорректный ответ. Повторите попытку.")
  }
  if (!res.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : fallback)
  }
  if (!data || (!data.requires_2fa && typeof data.access_token !== "string")) {
    throw new Error("Сервер вернул некорректный ответ. Повторите попытку.")
  }
  return data
}

export default function LoginPage() {
  const router = useRouter()

  // Form states
  const [step, setStep] = useState<"credentials" | "2fa">("credentials")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [userId, setUserId] = useState("")
  const [challengeToken, setChallengeToken] = useState("")
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
        }),
      })

      const data = await readAuthResponse(res, "Ошибка авторизации. Проверьте данные.")

      if (data.requires_2fa) {
        // Switch to TOTP 2FA step
        setUserId(data.user_id)
        setChallengeToken(data.challenge_token)
        setPassword("")
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
          challenge_token: challengeToken,
          username: username.trim(),
          code: totpCode.trim(),
        }),
      })

      const data = await readAuthResponse(res, "Неверный код подтверждения 2FA")

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
    const userRole = (data.role || "").toUpperCase()
    if (userRole === "ADMIN") {
      router.push("/admin")
    } else if (userRole === "TEACHER") {
      router.push("/teacher")
    } else {
      router.push("/student/profile")
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4 py-8 sm:px-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      {/* Brand header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-md group-hover:scale-105 transition-transform">
            112
          </div>
          <div className="text-left">
            <span className="font-extrabold tracking-tight text-xl block text-foreground">
              Система-112
            </span>
            <span className="text-xs text-muted-foreground block -mt-1">
              Учебный тренажерный комплекс
            </span>
          </div>
        </Link>
        <div className="shrink-0"><ThemeSelect compact /></div>
      </header>

      <div className="grid w-full items-stretch md:grid-cols-[1fr_1.1fr]">
      <Card className="w-full rounded-none border-0 bg-transparent justify-center py-8 shadow-none sm:px-2">
        {step === "credentials" ? (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Вход в систему</CardTitle>
              <CardDescription>
                Введите логин и пароль для доступа к тренажёру
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
                  <label htmlFor="login-username" className="text-sm font-medium text-foreground block">Логин</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-username"
                      autoComplete="username"
                      type="text"
                      required
                      placeholder="Логин"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-password" className="text-sm font-medium text-foreground block">Пароль</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      autoComplete="current-password"
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

      <section aria-labelledby="account-access-title" className="border-t border-border bg-muted/30 p-6 text-card-foreground md:border-t-0 md:border-l sm:p-8">
        <h2 id="account-access-title" className="text-xl font-semibold">Доступ к тренажёру</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Учётные записи учебного стенда. Введите логин и пароль — система откроет кабинет согласно вашей роли.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { role: "Курсант 1", login: "petrov@student.ru", password: "12345" },
            { role: "Курсант 2", login: "sidorov@student.ru", password: "12345" },
            { role: "Преподаватель", login: "teacher", password: "teacher123" },
            { role: "Администратор", login: "admin", password: "admin123" },
          ].map((account) => (
            <div key={account.login} className="rounded-lg border border-border bg-muted/40 p-3">
              <h3 className="text-sm font-semibold">{account.role}</h3>
              <dl className="mt-2 grid grid-cols-1 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Логин</dt>
                <dd className="min-w-0"><code className="select-all break-all font-mono">{account.login}</code></dd>
                <dt className="text-muted-foreground">Пароль</dt>
                <dd><code className="select-all font-mono">{account.password}</code></dd>
              </dl>
            </div>
          ))}
        </div>
      </section>
      </div>
      </div>
    </div>
  )
}
