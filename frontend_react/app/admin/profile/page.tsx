"use client"

import React, { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Smartphone,
  RefreshCw,
  Lock,
  User,
  Shield,
  AlertCircle,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"

export default function AdminProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [is2faEnabled, setIs2faEnabled] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [setupMode, setSetupMode] = useState<boolean>(false)

  // 2FA Setup states
  const [secret, setSecret] = useState<string>("")
  const [otpauthUrl, setOtpauthUrl] = useState<string>("")
  const [verifyCode, setVerifyCode] = useState<string>("")
  const [setupLoading, setSetupLoading] = useState<boolean>(false)
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false)
  const [disableLoading, setDisableLoading] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchProfileAnd2fa = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const headers: Record<string, string> = {}
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      // Fetch user profile
      const userRes = await fetch("/api/v1/users/me", { headers })
      if (userRes.ok) {
        const userData = await userRes.json()
        setUser(userData)
        if (typeof userData.is_2fa_enabled === "boolean") {
          setIs2faEnabled(userData.is_2fa_enabled)
        }
      }

      // Fetch 2FA status
      const statusRes = await fetch("/api/auth/2fa/status", { headers })
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setIs2faEnabled(Boolean(statusData.is_2fa_enabled))
      }
    } catch (e) {
      console.error("Error loading profile or 2FA status:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfileAnd2fa()
  }, [])

  const start2FASetup = async () => {
    setMessage(null)
    setSetupLoading(true)
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Не удалось инициализировать 2FA")
      }

      const data = await res.json()
      setSecret(data.secret)
      setOtpauthUrl(data.otpauth_url || data.uri)
      setSetupMode(true)
      setVerifyCode("")
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Ошибка запуска настройки 2FA" })
    } finally {
      setSetupLoading(false)
    }
  }

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setVerifyLoading(true)

    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch("/api/auth/2fa/verify-setup", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: verifyCode.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Неверный код подтверждения")
      }

      setIs2faEnabled(true)
      setSetupMode(false)
      setMessage({ type: "success", text: "Двухфакторная аутентификация успешно активирована!" })
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Неверный код 2FA" })
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!confirm("Вы уверены, что хотите отключить двухфакторную аутентификацию?")) {
      return
    }

    setMessage(null)
    setDisableLoading(true)

    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Не удалось отключить 2FA")
      }

      setIs2faEnabled(false)
      setSetupMode(false)
      setMessage({ type: "success", text: "2FA успешно отключена." })
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Ошибка при отключении 2FA" })
    } finally {
      setDisableLoading(false)
    }
  }

  const copySecret = () => {
    if (!secret) return
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Профиль администратора
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Управление параметрами безопасности и двухфакторной аутентификацией
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Учетная запись</CardTitle>
                <CardDescription>Основные данные авторизованного профиля</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {user?.role || "ADMIN"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-xs text-muted-foreground block">Имя пользователя</span>
            <span className="font-semibold text-foreground">{user?.username || "admin"}</span>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-xs text-muted-foreground block">ФИО / Название</span>
            <span className="font-semibold text-foreground">{user?.full_name || "Администратор комплекса"}</span>
          </div>
        </CardContent>
      </Card>

      {/* 2FA Security Card */}
      <Card className="border-2 border-border/80">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                  is2faEnabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {is2faEnabled ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold">Двухфакторная аутентификация (MFA / TOTP)</CardTitle>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      is2faEnabled
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {is2faEnabled ? "Включена" : "Отключена"}
                  </span>
                </div>
                <CardDescription className="mt-1">
                  Защита учетной записи 6-значным временным кодом из приложения Google Authenticator
                </CardDescription>
              </div>
            </div>

            {!setupMode && (
              <div>
                {is2faEnabled ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisable2FA}
                    disabled={disableLoading}
                    className="gap-2"
                  >
                    {disableLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Отключить 2FA
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={start2FASetup}
                    disabled={setupLoading}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {setupLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                    Включить 2FA
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        {setupMode && (
          <CardContent className="border-t pt-6 space-y-6">
            <div className="bg-muted/50 p-4 rounded-xl border border-border space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                Инструкция по настройке Google Authenticator:
              </h3>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>Откройте приложение <strong>Google Authenticator</strong> (или Яндекс Ключ / 2FAS) на телефоне.</li>
                <li>Нажмите <strong>«+»</strong> и выберите <strong>«Сканировать QR-код»</strong>.</li>
                <li>Отсканируйте код ниже или введите секретный ключ вручную.</li>
                <li>Введите появившийся 6-значный код в поле подтверждения.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-900 rounded-2xl border shadow-sm">
                {otpauthUrl ? (
                  <div className="p-3 bg-white rounded-xl shadow-inner border">
                    <QRCodeSVG
                      value={otpauthUrl}
                      size={180}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                ) : (
                  <div className="h-44 w-44 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )}
                <span className="text-xs text-muted-foreground mt-3">
                  Наведите камеру смартфона для сканирования
                </span>
              </div>

              {/* Secret Key & Verification Form */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Секретный ключ (для ручного ввода)
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={secret}
                      className="font-mono text-sm tracking-wider uppercase bg-muted/30"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={copySecret}
                      title="Скопировать ключ"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <form onSubmit={handleVerifySetup} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      6-значный код из приложения
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="000000"
                        autoFocus
                        required
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                        className="pl-9 font-mono text-lg tracking-widest"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={verifyLoading || verifyCode.length < 6}
                      className="gap-2"
                    >
                      {verifyLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Проверка...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Подтвердить и включить
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSetupMode(false)}
                      disabled={verifyLoading}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
