"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useForm, Controller } from "react-hook-form"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Play,
  Settings2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Flame,
  HeartPulse,
  Car,
  Shield,
  Fuel,
  Info,
} from "lucide-react"

export interface StudentGroup {
  group_id: string
  group_name: string
  profile: "OPERATOR_112" | "DISPATCHER_DDS"
  department?: string | null
  cadet_ids?: string[]
}

export type ComplexityLevel = "level_1" | "level_2" | "level_3" | "mixed"
export type DistributionMode = "live_stream" | "exam"

export interface SessionFormData {
  group_id: string
  categories: string[]
  complexity: ComplexityLevel
  distribution_mode: DistributionMode
  time_limit_seconds: string | number
  error_limit: string | number
}

const AVAILABLE_CATEGORIES = [
  { id: "Пожары", label: "Пожары", icon: Flame, color: "text-red-500 bg-red-500/10 border-red-500/30" },
  { id: "Медицина", label: "Медицина", icon: HeartPulse, color: "text-rose-500 bg-rose-500/10 border-rose-500/30" },
  { id: "ДТП", label: "ДТП", icon: Car, color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  { id: "Полиция", label: "Полиция", icon: Shield, color: "text-blue-500 bg-blue-500/10 border-blue-500/30" },
  { id: "Газовая служба", label: "Газовая служба", icon: Fuel, color: "text-orange-500 bg-orange-500/10 border-orange-500/30" },
  { id: "ЧС", label: "ЧС", icon: AlertTriangle, color: "text-purple-500 bg-purple-500/10 border-purple-500/30" },
]

export default function SessionSetupPage() {
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SessionFormData>({
    defaultValues: {
      group_id: "",
      categories: ["Пожары", "Медицина"],
      complexity: "level_1",
      distribution_mode: "live_stream",
      time_limit_seconds: "",
      error_limit: "",
    },
  })

  const selectedCategories = watch("categories") || []

  // Load groups from backend
  const loadGroups = useCallback(async () => {
    try {
      setIsLoadingGroups(true)
      const res = await fetch("/api/v1/groups")
      if (res.ok) {
        const data = await res.json()
        const list: StudentGroup[] = Array.isArray(data) ? data : []
        setGroups(list)
        if (list.length > 0) {
          setValue("group_id", list[0].group_id)
        }
      }
    } catch (e: any) {
      console.error("Failed to load groups", e)
    } finally {
      setIsLoadingGroups(false)
    }
  }, [setValue])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Category toggle handler
  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      if (selectedCategories.length === 1) {
        // keep at least 1 category or allow deselecting
        setValue(
          "categories",
          selectedCategories.filter((c) => c !== category),
          { shouldValidate: true }
        )
      } else {
        setValue(
          "categories",
          selectedCategories.filter((c) => c !== category),
          { shouldValidate: true }
        )
      }
    } else {
      setValue("categories", [...selectedCategories, category], {
        shouldValidate: true,
      })
    }
  }

  const onSubmit = async (data: SessionFormData) => {
    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      setSuccessMessage(null)

      if (!data.group_id) {
        setErrorMessage("Пожалуйста, выберите учебную группу")
        return
      }

      if (!data.categories || data.categories.length === 0) {
        setErrorMessage("Необходимо выбрать как минимум одну категорию происшествий")
        return
      }

      const payload = {
        group_id: data.group_id,
        categories: data.categories,
        complexity: data.complexity,
        distribution_mode: data.distribution_mode,
        time_limit_seconds:
          data.time_limit_seconds !== "" && data.time_limit_seconds !== undefined
            ? Number(data.time_limit_seconds)
            : undefined,
        error_limit:
          data.error_limit !== "" && data.error_limit !== undefined
            ? Number(data.error_limit)
            : undefined,
      }

      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Ошибка создания сессии (${res.status})`)
      }

      const session = await res.json()
      setCreatedSessionId(session.session_id || "new")
      setSuccessMessage(
        `Занятие успешно создано и запущено! ID сессии: ${session.session_id || "активна"}`
      )
    } catch (err: any) {
      setErrorMessage(err.message || "Не удалось создать занятие")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Settings2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Создать занятие
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Настройка параметров учебной сессии, выбор группы, сложности сценариев и запуск тестирования
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
          {createdSessionId && (
            <a
              href={`/teacher/sessions/${createdSessionId}/live`}
              className="inline-flex items-center justify-center text-xs font-semibold px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0"
            >
              Перейти к Live мониторингу →
            </a>
          )}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Параметры сессии</CardTitle>
            <CardDescription>
              Сконфигурируйте сценарий проведения занятия для выбранной учебной группы.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 1. Выбор Группы */}
            <div className="space-y-2">
              <Label htmlFor="group_id" className="flex items-center gap-1.5 font-semibold text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Выбор Группы <span className="text-destructive">*</span>
              </Label>
              <Select
                id="group_id"
                aria-label="Выбор Группы"
                {...register("group_id", { required: "Выберите группу" })}
                disabled={isLoadingGroups && groups.length === 0}
              >
                {isLoadingGroups && groups.length === 0 ? (
                  <SelectItem value="">Загрузка групп...</SelectItem>
                ) : groups.length === 0 ? (
                  <SelectItem value="">Нет доступных групп (создайте группу)</SelectItem>
                ) : (
                  groups.map((g) => (
                    <SelectItem key={g.group_id} value={g.group_id}>
                      {g.group_name} ({g.profile === "OPERATOR_112" ? "Оператор 112" : "Диспетчер ДДС"})
                    </SelectItem>
                  ))
                )}
              </Select>
              {errors.group_id && (
                <p className="text-xs text-destructive">{errors.group_id.message}</p>
              )}
            </div>

            {/* 2. Выбор Категорий (Multi-select) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-foreground">
                  Выбор Категорий <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  Выбрано: {selectedCategories.length} из {AVAILABLE_CATEGORIES.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {AVAILABLE_CATEGORIES.map((cat) => {
                  const isChecked = selectedCategories.includes(cat.id)
                  const Icon = cat.icon
                  return (
                    <label
                      key={cat.id}
                      htmlFor={`category-${cat.id}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                        isChecked
                          ? "border-primary bg-primary/5 shadow-xs font-medium"
                          : "border-border hover:bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={`category-${cat.id}`}
                        value={cat.id}
                        checked={isChecked}
                        onChange={() => handleCategoryToggle(cat.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${isChecked ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm truncate">{cat.label}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
              {selectedCategories.length === 0 && (
                <p className="text-xs text-destructive">Выберите хотя бы одну категорию</p>
              )}
            </div>

            {/* 3. Сложность (RadioGroup) */}
            <div className="space-y-2.5">
              <Label className="font-semibold text-foreground">
                Сложность <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="complexity"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3"
                  >
                    {[
                      {
                        value: "level_1",
                        label: "level_1",
                        title: "Уровень 1",
                        desc: "Базовый уровень, спокойные заявители, 0 ошибок по умолчанию",
                      },
                      {
                        value: "level_2",
                        label: "level_2",
                        title: "Уровень 2",
                        desc: "Средний уровень, взволнованные заявители, 1 ошибка",
                      },
                      {
                        value: "level_3",
                        label: "level_3",
                        title: "Уровень 3",
                        desc: "Сложный уровень, паника, помехи на линии, до 2 ошибок",
                      },
                      {
                        value: "mixed",
                        label: "mixed",
                        title: "Смешанный",
                        desc: "Случайный подбор сложности для комплексного экзамена",
                      },
                    ].map((item) => (
                      <label
                        key={item.value}
                        htmlFor={`complexity-${item.value}`}
                        className={`flex flex-col p-3.5 rounded-lg border cursor-pointer transition-all ${
                          field.value === item.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <RadioGroupItem
                              id={`complexity-${item.value}`}
                              value={item.value}
                            />
                            <span className="font-medium text-sm text-foreground">
                              {item.title}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono py-0">
                            {item.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug pl-6">
                          {item.desc}
                        </p>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </div>

            {/* 4. Режим распределения (RadioGroup) */}
            <div className="space-y-2.5">
              <Label className="font-semibold text-foreground">
                Режим распределения <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="distribution_mode"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    {[
                      {
                        value: "live_stream",
                        title: "Поток в реальном времени",
                        badge: "live_stream",
                        desc: "Непрерывный поток входящих вызовов курсантам с динамическим распределением",
                      },
                      {
                        value: "exam",
                        title: "Экзаменационный режим",
                        badge: "exam",
                        desc: "Строго фиксированный билет или набор билетов для аттестации курсанта",
                      },
                    ].map((mode) => (
                      <label
                        key={mode.value}
                        htmlFor={`mode-${mode.value}`}
                        className={`flex flex-col p-3.5 rounded-lg border cursor-pointer transition-all ${
                          field.value === mode.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <RadioGroupItem id={`mode-${mode.value}`} value={mode.value} />
                            <span className="font-medium text-sm text-foreground">
                              {mode.title}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] font-mono py-0">
                            {mode.badge}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug pl-6">
                          {mode.desc}
                        </p>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </div>

            {/* 5. Опциональные настройки */}
            <div className="border-t pt-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm text-foreground">
                  Опциональные ограничения и лимиты
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="time_limit_seconds">Лимит времени (сек)</Label>
                  <Input
                    id="time_limit_seconds"
                    type="number"
                    min={5}
                    max={600}
                    placeholder="Автоматически"
                    {...register("time_limit_seconds")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Время на обработку одного звонка (по умолчанию 30 сек)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="error_limit">Допустимое количество ошибок</Label>
                  <Input
                    id="error_limit"
                    type="number"
                    min={0}
                    max={10}
                    placeholder="Автоматически"
                    {...register("error_limit")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Лимит ошибок на сессию (рассчитывается от сложности)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <span>После запуска сессия перейдет в статус "active"</span>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || (groups.length === 0 && !isLoadingGroups)}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Создание занятия...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Создать и запустить
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export { SessionSetupPage }
