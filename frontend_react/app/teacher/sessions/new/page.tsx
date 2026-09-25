"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
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
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Headphones,
  Radio,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Info,
  Sparkles,
  Layers,
  Flame,
  Car,
  HeartPulse,
  Wind,
  ShieldAlert,
  Bomb,
  Building,
  Building2,
  Waves,
  LifeBuoy,
  RotateCcw,
  Truck,
  Construction,
  PawPrint,
  Baby,
  Skull,
  HandHeart,
  Siren,
  Biohazard,
  Factory,
  CloudLightning,
  Leaf,
  HelpCircle,
} from "lucide-react"

export interface StudentGroup {
  group_id: string
  group_name: string
  profile?: "OPERATOR_112" | "DISPATCHER_DDS" | null
  department?: string | null
  cadet_ids?: string[]
  student_count?: number
}

export type TargetRole = "OPERATOR_112" | "DISPATCHER_DDS"
export type ComplexityLevel = "level_1" | "level_2" | "level_3" | "adaptive" | "mixed"
export type DistributionMode = "live_stream" | "exam"

export interface SessionFormData {
  group_id: string
  target_role: TargetRole
  categories: string[]
  complexity: ComplexityLevel
  distribution_mode: DistributionMode
  time_limit_seconds: string | number
  error_limit: string | number
}

const getCategoryIcon = (category: string) => {
  const lower = category.toLowerCase()
  if (lower.includes("пожар") || lower.includes("дым")) return Flame
  if (lower.includes("дтп")) return Car
  if (lower.includes("дорог")) return Construction
  if (lower.includes("транспорт") || lower.includes("автомоб") || lower.includes("авария")) return Truck
  if (lower.includes("мед") || lower.includes("скорая") || lower.includes("здоров") || lower.includes("неотложн")) return HeartPulse
  if (lower.includes("газ")) return Wind
  if (lower.includes("террор") || lower.includes("сирен")) return Siren
  if (lower.includes("взрыв")) return Bomb
  if (lower.includes("правопоряд") || lower.includes("преступ") || lower.includes("полиц") || lower.includes("безопасн")) return ShieldAlert
  if (lower.includes("животн") || lower.includes("собак") || lower.includes("кошк")) return PawPrint
  if (lower.includes("ребенок") || lower.includes("дети")) return Baby
  if (lower.includes("смерт") || lower.includes("труп")) return Skull
  if (lower.includes("социальн")) return HandHeart
  if (lower.includes("выброс") || lower.includes("опасных веществ") || lower.includes("химич") || lower.includes("радиац")) return Biohazard
  if (lower.includes("производств") || lower.includes("завод") || lower.includes("промышлен") || lower.includes("опасных и производств")) return Factory
  if (lower.includes("гидротехн") || lower.includes("дамб") || lower.includes("водоем") || lower.includes("вод")) return Waves
  if (lower.includes("метеоролог") || lower.includes("геологич") || lower.includes("погод") || lower.includes("гроз") || lower.includes("стихий")) return CloudLightning
  if (lower.includes("эколог") || lower.includes("природ") || lower.includes("лес")) return Leaf
  if (lower.includes("обруш") || lower.includes("строит")) return Building
  if (lower.includes("городск") || lower.includes("жкх") || lower.includes("хозяйств")) return Building2
  if (lower.includes("человек в") || lower.includes("опасност")) return LifeBuoy
  if (lower.includes("прочие")) return HelpCircle
  return HelpCircle
}

export default function SessionSetupPage() {
  let router: any = null
  try {
    router = useRouter()
  } catch {
    // Router context not available in unit test environments
  }

  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)
  const [classifierCategories, setClassifierCategories] = useState<string[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, string[]>>({})
  const [loadingSubcategories, setLoadingSubcategories] = useState<Record<string, boolean>>({})
  const [categorySearchQuery, setCategorySearchQuery] = useState("")
  
  // NEW: Ticket counts
  const [ticketCounts, setTicketCounts] = useState<any[]>([])

  // Stage 1 (Main Categories) & Stage 2 (Subcategories) selection
  // Mode: all categories selected by default
  const [isAllCategoriesSelected, setIsAllCategoriesSelected] = useState<boolean>(true)
  const [selectedMainCategories, setSelectedMainCategories] = useState<string[]>([])
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([])

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
      target_role: "OPERATOR_112",
      categories: [],
      complexity: "adaptive",
      distribution_mode: "live_stream",
      time_limit_seconds: "30",
      error_limit: "",
    },
  })

  const selectedGroupId = watch("group_id")
  const selectedComplexity = watch("complexity")

  const COMPLEXITY_LEVEL_MAP: Record<string, number | null> = {
    level_1: 1,
    level_2: 2,
    level_3: 3,
    adaptive: null,
  }

  const COMPLEXITY_DEFAULT_ERRORS: Record<string, number> = {
    level_1: 0,
    level_2: 1,
    level_3: 2,
    adaptive: 2,
  }

  const defaultErrors = COMPLEXITY_DEFAULT_ERRORS[selectedComplexity] ?? 2

  // Load groups from backend (Do not auto-select first group per ТЗ 41)
  const loadGroups = useCallback(async () => {
    try {
      setIsLoadingGroups(true)
      const res = await fetch("/api/v1/groups")
      if (res.ok) {
        const data = await res.json()
        const list: StudentGroup[] = Array.isArray(data) ? data : []
        setGroups(list)
      }
    } catch (e: any) {
      console.error("Failed to load groups", e)
    } finally {
      setIsLoadingGroups(false)
    }
  }, [])

  // Load classifier incident categories in strictly alphabetical order

  const loadTicketCounts = useCallback(async (complexity?: number | null) => {
    try {
      const url = complexity ? `/api/v1/tickets/counts?complexity=${complexity}` : "/api/v1/tickets/counts"
      const res = await fetch(url)
      if (res && res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setTicketCounts(data)
        } else {
          setTicketCounts([])
        }
      }
    } catch (e) {
      console.error("Failed to load ticket counts", e)
    }
  }, [])

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true)
      const res = await fetch("/api/classifier/categories")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          // Filter to incident categories only (exclude service names if any)
          const incidentCategories = data.filter((cat: string) => {
            const lower = cat.toLowerCase()
            return (
              !lower.startsWith("01 ") &&
              !lower.startsWith("02 ") &&
              !lower.startsWith("03 ") &&
              !lower.startsWith("04 ") &&
              !lower.includes("служба")
            )
          })
          const finalCats = incidentCategories.length > 0 ? incidentCategories : data
          finalCats.sort((a, b) => a.localeCompare(b, "ru"))
          setClassifierCategories(finalCats)
        }
      }
    } catch (e: any) {
      console.error("Failed to load categories", e)
    } finally {
      setIsLoadingCategories(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
    loadCategories()
  }, [loadGroups, loadCategories])

  useEffect(() => {
    const compNum = COMPLEXITY_LEVEL_MAP[selectedComplexity] ?? null
    loadTicketCounts(compNum)
  }, [selectedComplexity, loadTicketCounts])

  // Fetch subcategories for a given category (strictly alphabetical sort)
  const fetchSubcategories = useCallback(async (cat: string) => {
    if (subcategoriesMap[cat]) return
    try {
      setLoadingSubcategories((prev) => ({ ...prev, [cat]: true }))
      const res = await fetch(
        `/api/classifier/subcategories?category=${encodeURIComponent(cat)}`
      )
      if (res.ok) {
        const subs = await res.json()
        if (Array.isArray(subs)) {
          const sorted = [...subs].sort((a, b) => a.localeCompare(b, "ru"))
          setSubcategoriesMap((prev) => ({ ...prev, [cat]: sorted }))
        }
      }
    } catch (e) {
      console.error("Failed to load subcategories for", cat, e)
    } finally {
      setLoadingSubcategories((prev) => ({ ...prev, [cat]: false }))
    }
  }, [subcategoriesMap])

  // Automatically fetch subcategories for any selected main categories
  useEffect(() => {
    selectedMainCategories.forEach((cat) => {
      if (!subcategoriesMap[cat] && !loadingSubcategories[cat]) {
        fetchSubcategories(cat)
      }
    })
  }, [selectedMainCategories, subcategoriesMap, loadingSubcategories, fetchSubcategories])

  // Sync selected categories + subcategories to react-hook-form
  useEffect(() => {
    if (selectedMainCategories.length === 0) {
      setValue("categories", [], { shouldValidate: true })
    } else {
      const combined = Array.from(new Set([...selectedMainCategories, ...selectedSubcategories]))
      setValue("categories", combined, { shouldValidate: true })
    }
  }, [selectedMainCategories, selectedSubcategories, setValue])

  // Stage 1: Toggle category (ТЗ 46: first click resets "all categories" and picks only clicked)
  const handleToggleMainCategory = (category: string) => {
    if (isAllCategoriesSelected) {
      setIsAllCategoriesSelected(false)
      setSelectedMainCategories([category])
      setSelectedSubcategories([])
      fetchSubcategories(category)
      return
    }

    if (selectedMainCategories.includes(category)) {
      const nextCats = selectedMainCategories.filter((c) => c !== category)
      setSelectedMainCategories(nextCats)
      const subsToRemove = subcategoriesMap[category] || []
      setSelectedSubcategories((prev) => prev.filter((s) => !subsToRemove.includes(s)))
    } else {
      setSelectedMainCategories([...selectedMainCategories, category])
      fetchSubcategories(category)
    }
  }

  // Reset to "all categories"
  const handleSelectAllCategories = () => {
    setIsAllCategoriesSelected(true)
    setSelectedMainCategories([])
    setSelectedSubcategories([])
  }

  // Stage 2: Toggle subcategory
  const handleToggleSubcategory = (sub: string) => {
    if (selectedSubcategories.includes(sub)) {
      setSelectedSubcategories(selectedSubcategories.filter((s) => s !== sub))
    } else {
      setSelectedSubcategories([...selectedSubcategories, sub])
    }
  }

  // Toggle all subcategories under a specific category
  const handleToggleAllSubsForCategory = (cat: string) => {
    const subs = subcategoriesMap[cat] || []
    if (subs.length === 0) return
    const allSelected = subs.every((s) => selectedSubcategories.includes(s))
    if (allSelected) {
      setSelectedSubcategories((prev) => prev.filter((s) => !subs.includes(s)))
    } else {
      setSelectedSubcategories((prev) => Array.from(new Set([...prev, ...subs])))
    }
  }

  // Reset all categories and subcategories (restores "all categories" mode per ТЗ 46)
  const handleClearCategories = () => {
    setIsAllCategoriesSelected(true)
    setSelectedMainCategories([])
    setSelectedSubcategories([])
    setCategorySearchQuery("")
    setValue("categories", [])
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

      const selectedGroup = groups.find((g) => g.group_id === data.group_id)
      const cadetCount = selectedGroup
        ? typeof selectedGroup.student_count === "number"
          ? selectedGroup.student_count
          : (selectedGroup.cadet_ids?.length ?? 0)
        : 0

      if (cadetCount === 0) {
        setErrorMessage("Невозможно создать занятие для пустой группы (0 человек)")
        return
      }

      if (!isAllCategoriesSelected && selectedMainCategories.length === 0) {
        setErrorMessage("Пожалуйста, выберите хотя бы одну категорию происшествий")
        return
      }

      const payload = {
        group_id: data.group_id,
        target_role: data.target_role,
        categories: isAllCategoriesSelected ? [] : (data.categories || []),
        complexity: data.complexity,
        distribution_mode: data.distribution_mode,
        time_limit_seconds:
          data.time_limit_seconds !== "" && data.time_limit_seconds !== undefined
            ? Number(data.time_limit_seconds)
            : 30,
        error_limit:
          data.error_limit !== "" && data.error_limit !== undefined
            ? Number(data.error_limit)
            : undefined,
      }

      // POST to /api/v1/lessons (with fallback to /api/v1/sessions)
      let res = await fetch("/api/v1/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok && res.status === 404) {
        // Fallback to /api/v1/sessions if lessons not mounted
        res = await fetch("/api/v1/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Ошибка создания занятия (${res.status})`)
      }

      const lessonData = await res.json()
      const lessonId =
        lessonData.id || lessonData.lesson_id || lessonData.assignment_id || lessonData.session_id || "new"

      setCreatedSessionId(lessonId)
      setSuccessMessage(`Урок успешно создан и подготовлен к запуску!`)

      // Redirect teacher to live lobby
      const liveUrl = `/teacher/sessions/${lessonId}/live`
      if (router && typeof router.push === "function") {
        router.push(liveUrl)
      } else if (typeof window !== "undefined") {
        window.location.href = liveUrl
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Не удалось создать занятие")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered categories for UI search
  
  const getCategoryCount = (catName: string) => {
    if (!Array.isArray(ticketCounts)) return 0
    const c = ticketCounts.find((t) => t?.category === catName)
    return c ? (c.total || 0) : 0
  }

  const getSubcategoryCount = (catName: string, subName: string) => {
    if (!Array.isArray(ticketCounts)) return 0
    const c = ticketCounts.find((t) => t?.category === catName)
    if (!c || !c.subcategories) return 0
    return c.subcategories[subName] || 0
  }

  const getTotalAvailableTickets = () => {
    if (!Array.isArray(ticketCounts)) return 0
    if (isAllCategoriesSelected) {
      return ticketCounts.reduce((acc, curr) => acc + (curr?.total || 0), 0)
    }
    if (selectedMainCategories.length === 0) {
      return 0
    }
    let total = 0
    selectedMainCategories.forEach((cat) => {
      const c = ticketCounts.find((t) => t?.category === cat)
      if (c) {
        if (selectedSubcategories.length === 0) {
          total += (c.total || 0)
        } else {
          const subsInCat = subcategoriesMap[cat] || []
          const selectedInCat = subsInCat.filter((s) => selectedSubcategories.includes(s))
          if (selectedInCat.length === 0) {
            total += (c.total || 0)
          } else {
            selectedInCat.forEach((s) => {
              total += (c.subcategories?.[s] || 0)
            })
          }
        }
      }
    })
    return total
  }

  const filteredCategories = classifierCategories
    .filter((cat) => cat.toLowerCase().includes(categorySearchQuery.toLowerCase()))
    .sort((a, b) => {
      const countA = getCategoryCount(a)
      const countB = getCategoryCount(b)
      if (countA > 0 && countB === 0) return -1
      if (countA === 0 && countB > 0) return 1
      return a.localeCompare(b, "ru")
    })

  // Submit button disabled state: group required and must not be empty (ТЗ 43)
  const selectedGroupObj = groups.find((g) => g.group_id === selectedGroupId)
  const selectedGroupCadetCount = selectedGroupObj
    ? typeof selectedGroupObj.student_count === "number"
      ? selectedGroupObj.student_count
      : (selectedGroupObj.cadet_ids?.length ?? 0)
    : 0
  const isCategoriesInvalid = !isAllCategoriesSelected && selectedMainCategories.length === 0
  const totalAvailableTickets = getTotalAvailableTickets()
  const isNoTickets = (ticketCounts.length > 0 || !isAllCategoriesSelected) && totalAvailableTickets === 0

  const isSubmitDisabled =
    isSubmitting ||
    !selectedGroupId ||
    (selectedGroupObj ? selectedGroupCadetCount === 0 : false) ||
    isCategoriesInvalid ||
    isNoTickets

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shadow-2xs">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Запуск урока
            </h1>
            <p className="text-xs text-muted-foreground">
              Настройка группового занятия, выбор профильной роли, фильтрация происшествий и уровень сложности
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-green-700 dark:text-green-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium">{successMessage}</span>
          </div>
          {createdSessionId && (
            <a
              href={`/teacher/sessions/${createdSessionId}/live`}
              className="inline-flex items-center justify-center text-xs font-semibold px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0"
            >
              Перейти в лобби урока →
            </a>
          )}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-6">
            <CardTitle className="text-lg">Параметры группового занятия</CardTitle>
            <CardDescription className="text-xs">
              Сконфигурируйте сценарий проведения тренировочной сессии для учебной группы.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 space-y-4">
            {/* РЯД 1: Учебная группа (слева) + Уровень сложности (справа) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* 1. Выбор Группы */}
              <div className="space-y-1.5">
                <Label htmlFor="group_id" className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                  <Users className="h-4 w-4 text-primary" />
                  Учебная группа <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="group_id"
                  aria-label="Выбор Группы"
                  {...register("group_id", {
                    required: "Пожалуйста, выберите учебную группу",
                    validate: (val) => {
                      if (!val) return "Пожалуйста, выберите учебную группу"
                      const grp = groups.find((g) => g.group_id === val)
                      const count = grp
                        ? typeof grp.student_count === "number"
                          ? grp.student_count
                          : (grp.cadet_ids?.length ?? 0)
                        : 0
                      if (count === 0) {
                        return "Невозможно выбрать группу без учеников"
                      }
                      return true
                    },
                  })}
                  disabled={isLoadingGroups && groups.length === 0}
                >
                  <SelectItem value="">Выберите учебную группу...</SelectItem>
                  {isLoadingGroups && groups.length === 0 ? (
                    <SelectItem value="" disabled>Загрузка групп...</SelectItem>
                  ) : groups.length === 0 ? (
                    <SelectItem value="" disabled>Нет доступных групп (создайте группу)</SelectItem>
                  ) : (
                    groups.map((g) => {
                      const count =
                        typeof g.student_count === "number"
                          ? g.student_count
                          : (g.cadet_ids?.length ?? 0)
                      const isEmpty = count === 0
                      const label = `${g.group_name}${g.department ? ` (${g.department})` : ""} ${
                        isEmpty ? "(0 человек) (нет учеников)" : `(${count} чел.)`
                      }`
                      return (
                        <SelectItem key={g.group_id} value={g.group_id} disabled={isEmpty}>
                          {label}
                        </SelectItem>
                      )
                    })
                  )}
                </Select>
                {errors.group_id && (
                  <p className="text-xs text-destructive">{errors.group_id.message}</p>
                )}
                {!errors.group_id && selectedGroupObj && selectedGroupCadetCount === 0 && (
                  <p className="text-xs text-destructive">Невозможно создать занятие для пустой группы (0 человек)</p>
                )}
              </div>

              {/* 2. Уровень сложности */}
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground text-sm">
                  Уровень сложности <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="complexity"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
                    >
                      {[
                        {
                          value: "level_1",
                          title: "Базовый",
                          accent: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500 text-muted-foreground",
                          activeAccent: "border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600 text-foreground font-semibold",
                          dotClass: "bg-emerald-500",
                        },
                        {
                          value: "level_2",
                          title: "Средний",
                          accent: "border-amber-500/40 bg-amber-500/5 hover:border-amber-500 text-muted-foreground",
                          activeAccent: "border-amber-600 bg-amber-500/10 ring-1 ring-amber-600 text-foreground font-semibold",
                          dotClass: "bg-amber-500",
                        },
                        {
                          value: "level_3",
                          title: "Продвинутый",
                          accent: "border-rose-500/40 bg-rose-500/5 hover:border-rose-500 text-muted-foreground",
                          activeAccent: "border-rose-600 bg-rose-500/10 ring-1 ring-rose-600 text-foreground font-semibold",
                          dotClass: "bg-rose-500",
                        },
                        {
                          value: "adaptive",
                          title: "Адаптивный",
                          accent: "border-blue-500/40 bg-blue-500/5 hover:border-blue-500 text-muted-foreground",
                          activeAccent: "border-blue-600 bg-blue-500/10 ring-1 ring-blue-600 text-foreground font-semibold",
                          dotClass: "bg-blue-500",
                        },
                      ].map((item) => {
                        const isSelected = field.value === item.value
                        return (
                          <label
                            key={item.value}
                            htmlFor={`complexity-${item.value}`}
                            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border cursor-pointer transition-all text-center select-none ${
                              isSelected ? item.activeAccent : item.accent
                            }`}
                          >
                            <RadioGroupItem
                              id={`complexity-${item.value}`}
                              value={item.value}
                              className="sr-only"
                            />
                            <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`} />
                            <span className="text-xs truncate">
                              {item.title}
                            </span>
                          </label>
                        )
                      })}
                    </RadioGroup>
                  )}
                />
                <div className="text-[11px] text-muted-foreground leading-tight">
                  Допустимое количество ошибок рассчитывается на основе сложности (по умолчанию: {defaultErrors})
                </div>
              </div>
            </div>

            {/* РЯД 2: Роль для тренировки (слева) + Режим проведения занятия (справа) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* 3. Роль для тренировки */}
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                  <Headphones className="h-4 w-4 text-primary" />
                  Роль для тренировки <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="target_role"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-2 gap-2"
                    >
                      {[
                        {
                          value: "OPERATOR_112",
                          title: "Оператор 112",
                          icon: Headphones,
                          badge: "Вызовы 112",
                        },
                        {
                          value: "DISPATCHER_DDS",
                          title: "Диспетчер ДДС",
                          icon: Radio,
                          badge: "Карточки ДДС",
                        },
                      ].map((role) => {
                        const Icon = role.icon
                        const isSelected = field.value === role.value
                        return (
                          <label
                            key={role.value}
                            htmlFor={`role-${role.value}`}
                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                                : "border-border hover:bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <RadioGroupItem id={`role-${role.value}`} value={role.value} />
                              <Icon className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                              <span className="font-semibold text-xs text-foreground truncate">
                                {role.title}
                              </span>
                            </div>
                            <Badge variant={isSelected ? "default" : "outline"} className="text-[9px] px-1 py-0 shrink-0">
                              {role.badge}
                            </Badge>
                          </label>
                        )
                      })}
                    </RadioGroup>
                  )}
                />
              </div>

              {/* 4. Режим проведения занятия */}
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground text-sm">
                  Режим проведения занятия <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="distribution_mode"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-2 gap-2"
                    >
                      {[
                        {
                          value: "live_stream",
                          title: "Поток в реальном времени",
                        },
                        {
                          value: "exam",
                          title: "Экзаменационный режим",
                        },
                      ].map((mode) => {
                        const isSelected = field.value === mode.value
                        return (
                          <label
                            key={mode.value}
                            htmlFor={`mode-${mode.value}`}
                            className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                                : "border-border hover:bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <RadioGroupItem id={`mode-${mode.value}`} value={mode.value} />
                              <span className="font-medium text-xs text-foreground truncate">
                                {mode.title}
                              </span>
                            </div>
                          </label>
                        )
                      })}
                    </RadioGroup>
                  )}
                />
              </div>
            </div>

            {/* РЯД 3: Категории и подкатегории происшествий (Этап 1 и 2 в 2 столбика, срезанные по высоте) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                  <Layers className="h-4 w-4 text-primary" />
                  Категории и подкатегории происшествий
                </Label>
                {(selectedMainCategories.length > 0 || selectedSubcategories.length > 0 || categorySearchQuery) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearCategories}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground px-2 flex items-center gap-1 border-dashed hover:border-primary/50 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Сбросить фильтры</span>
                  </Button>
                )}
              </div>

              {/* Выбранные чипы (Категории и Подкатегории) */}
              {(selectedMainCategories.length > 0 || selectedSubcategories.length > 0) && (
                <div className="flex flex-wrap gap-1 p-2 bg-muted/30 rounded-lg border border-border/60 max-h-16 overflow-y-auto">
                  {selectedMainCategories.map((cat) => {
                    const CatIcon = getCategoryIcon(cat)
                    return (
                      <Badge
                        key={`chip-cat-${cat}`}
                        variant="secondary"
                        className="pl-2 pr-1 py-0.5 text-[11px] flex items-center gap-1 bg-background border border-primary/20 shadow-2xs font-medium text-primary"
                      >
                        <CatIcon className="h-3 w-3 shrink-0" />
                        <span>Категория: {cat}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleMainCategory(cat)}
                        className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Удалить категорию ${cat}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                    )
                  })}
                  {selectedSubcategories.map((sub) => (
                    <Badge
                      key={`chip-sub-${sub}`}
                      variant="outline"
                      className="pl-2 pr-1 py-0.5 text-[11px] flex items-center gap-1 bg-background shadow-2xs"
                    >
                      <span>{sub}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSubcategory(sub)}
                        className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Удалить подкатегорию ${sub}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* 2 параллельных вертикальных блока со срезанной наполовину высотой */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Левый столбик: Категории */}
                <div className="border rounded-xl p-2.5 bg-card space-y-2 shadow-2xs flex flex-col h-full">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Этап 1: Выберите категории происшествий</span>
                      {selectedMainCategories.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          {selectedMainCategories.length}
                        </Badge>
                      )}
                    </h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={handleSelectAllCategories}
                    >
                      Все
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Поиск по категориям..."
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      className="pl-8 text-xs h-8 bg-background"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: "190px" }}>
                    {isLoadingCategories ? (
                      <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Загрузка категорий...
                      </div>
                    ) : filteredCategories.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">Не найдены</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {filteredCategories.map((category) => {
                          const isSelected = selectedMainCategories.includes(category)
                          const count = getCategoryCount(category)
                          const CategoryIcon = getCategoryIcon(category)
                          return (
                            <label
                              key={category}
                              htmlFor={`main-cat-${category}`}
                              className={`flex items-center justify-between p-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors select-none ${
                                isSelected
                                  ? "border-primary bg-primary/5 text-foreground font-semibold"
                                  : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <input
                                  id={`main-cat-${category}`}
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleMainCategory(category)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                                />
                                <CategoryIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                                <span className="truncate" title={category}>{category}</span>
                              </div>
                              <Badge
                                variant={count > 0 ? "default" : "secondary"}
                                className={`text-[9px] px-1 py-0 ml-1.5 shrink-0 ${count === 0 ? 'opacity-40' : ''}`}
                              >
                                {count}
                              </Badge>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Правый столбик: Подкатегории */}
                <div className="border rounded-xl p-2.5 bg-card space-y-2 shadow-2xs flex flex-col h-full">
                  <div className="border-b pb-1.5 flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Этап 2: Подкатегории происшествий</span>
                      {selectedSubcategories.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          {selectedSubcategories.length}
                        </Badge>
                      )}
                    </h4>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: "190px" }}>
                    {selectedMainCategories.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground bg-muted/10 h-full min-h-[140px] flex flex-col items-center justify-center">
                        <Layers className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                        <p className="text-xs font-medium text-foreground">Подкатегории заблокированы</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Выберите категорию для просмотра подкатегорий
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(() => {
                          // Top block: categories that have tickets > 0
                          const positiveCategories = selectedMainCategories
                            .filter((cat) => getCategoryCount(cat) > 0)
                            .sort((a, b) => a.localeCompare(b, "ru"))

                          // Bottom block: categories that have zero subcategories (catTotal === 0 or positive cat with zero-ticket subcategories)
                          const zeroCategoriesWithSubs = selectedMainCategories
                            .map((cat) => {
                              const allSubs = subcategoriesMap[cat] || []
                              const zeroSubs = allSubs
                                .filter((sub) => getSubcategoryCount(cat, sub) === 0)
                                .sort((a, b) => a.localeCompare(b, "ru"))
                              const catTotal = getCategoryCount(cat)
                              return { cat, zeroSubs, catTotal }
                            })
                            .filter(({ zeroSubs, catTotal }) => {
                              if (catTotal === 0) return true
                              return zeroSubs.length > 0
                            })
                            .sort((a, b) => a.cat.localeCompare(b.cat, "ru"))

                          // Subcategory row renderer
                          const renderSubItem = (cat: string, sub: string) => {
                            const isSubChecked = selectedSubcategories.includes(sub)
                            const count = getSubcategoryCount(cat, sub)
                            return (
                              <label
                                key={`${cat}-${sub}`}
                                htmlFor={`sub-${sub}`}
                                className={`flex items-center justify-between p-1 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                                  isSubChecked
                                    ? "border-primary/60 bg-primary/10 text-foreground font-medium"
                                    : "border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <input
                                    id={`sub-${sub}`}
                                    type="checkbox"
                                    checked={isSubChecked}
                                    onChange={() => handleToggleSubcategory(sub)}
                                    className="h-3 w-3 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                                  />
                                  <span className="truncate" title={sub}>{sub}</span>
                                </div>
                                <Badge
                                  variant={count > 0 ? "outline" : "secondary"}
                                  className={`text-[9px] px-1 py-0 ml-1 shrink-0 ${count === 0 ? 'opacity-40' : ''}`}
                                >
                                  {count}
                                </Badge>
                              </label>
                            )
                          }

                          // Render positive category card (showing ONLY subcategories with tickets > 0)
                          const renderPositiveCategoryCard = (cat: string) => {
                            const isLoadingSubs = !!loadingSubcategories[cat]
                            const allSubs = subcategoriesMap[cat] || []
                            const nonZeroSubs = allSubs
                              .filter((sub) => getSubcategoryCount(cat, sub) > 0)
                              .sort((a, b) => a.localeCompare(b, "ru"))
                            const displaySubs = nonZeroSubs.length > 0 ? nonZeroSubs : allSubs
                            const allSelected = displaySubs.length > 0 && displaySubs.every((s) => selectedSubcategories.includes(s))

                            const handleTogglePositiveSubs = () => {
                              if (allSelected) {
                                setSelectedSubcategories((prev) => prev.filter((s) => !displaySubs.includes(s)))
                              } else {
                                setSelectedSubcategories((prev) => Array.from(new Set([...prev, ...displaySubs])))
                              }
                            }

                            return (
                              <div key={`pos-${cat}`} className="rounded-lg border border-border/70 p-2 bg-muted/20 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 overflow-hidden max-w-[70%]">
                                    {React.createElement(getCategoryIcon(cat), { className: "h-3.5 w-3.5 text-primary shrink-0" })}
                                    <span className="font-semibold text-xs text-foreground truncate">{cat}</span>
                                  </div>
                                  {displaySubs.length > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 text-[10px] px-1.5"
                                      onClick={handleTogglePositiveSubs}
                                    >
                                      {allSelected ? "Снять все" : "Выбрать все"}
                                    </Button>
                                  )}
                                </div>
                                {isLoadingSubs ? (
                                  <div className="text-xs text-muted-foreground py-1">
                                    <Loader2 className="inline-block h-3 w-3 animate-spin mr-1 text-primary" />
                                    Загрузка...
                                  </div>
                                ) : displaySubs.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground italic py-0.5">Нет подкатегорий</p>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {displaySubs.map((sub) => renderSubItem(cat, sub))}
                                  </div>
                                )}
                              </div>
                            )
                          }

                          // Render zero category card (showing subcategories with 0 tickets)
                          const renderZeroCategoryCard = ({ cat, zeroSubs, catTotal }: { cat: string, zeroSubs: string[], catTotal: number }) => {
                            const isLoadingSubs = !!loadingSubcategories[cat]
                            const allSelected = zeroSubs.length > 0 && zeroSubs.every((s) => selectedSubcategories.includes(s))

                            const handleToggleZeroSubs = () => {
                              if (allSelected) {
                                setSelectedSubcategories((prev) => prev.filter((s) => !zeroSubs.includes(s)))
                              } else {
                                setSelectedSubcategories((prev) => Array.from(new Set([...prev, ...zeroSubs])))
                              }
                            }

                            return (
                              <div key={`zero-${cat}`} className="rounded-lg border border-border/50 p-2 bg-muted/10 space-y-1.5 opacity-80 hover:opacity-100 transition-opacity">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 overflow-hidden max-w-[70%]">
                                    {React.createElement(getCategoryIcon(cat), { className: "h-3.5 w-3.5 text-muted-foreground shrink-0" })}
                                    <span className="font-semibold text-xs text-foreground truncate">{cat}</span>
                                    {catTotal > 0 && (
                                      <span className="text-[10px] text-muted-foreground font-normal">(остальные)</span>
                                    )}
                                  </div>
                                  {zeroSubs.length > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 text-[10px] px-1.5 text-muted-foreground"
                                      onClick={handleToggleZeroSubs}
                                    >
                                      {allSelected ? "Снять все" : "Выбрать все"}
                                    </Button>
                                  )}
                                </div>
                                {isLoadingSubs ? (
                                  <div className="text-xs text-muted-foreground py-1">
                                    <Loader2 className="inline-block h-3 w-3 animate-spin mr-1 text-primary" />
                                    Загрузка...
                                  </div>
                                ) : zeroSubs.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground italic py-0.5">Нет подкатегорий</p>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    {zeroSubs.map((sub) => renderSubItem(cat, sub))}
                                  </div>
                                )}
                              </div>
                            )
                          }

                          const hasPositive = positiveCategories.length > 0
                          const hasZero = zeroCategoriesWithSubs.length > 0

                          return (
                            <>
                              {hasPositive
                                ? positiveCategories.map(renderPositiveCategoryCard)
                                : selectedMainCategories
                                    .slice()
                                    .sort((a, b) => a.localeCompare(b, "ru"))
                                    .map(renderPositiveCategoryCard)}
                              {hasPositive && hasZero && (
                                <div className="relative my-2.5 py-1">
                                  <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border/80" />
                                  </div>
                                  <div className="relative flex justify-center text-[10px]">
                                    <span className="bg-card px-2 text-muted-foreground font-medium">
                                      Категории и подкатегории без доступных билетов (0)
                                    </span>
                                  </div>
                                </div>
                              )}
                              {hasPositive && zeroCategoriesWithSubs.map(renderZeroCategoryCard)}
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* РЯД 4: Лимиты времени и ошибок */}
            <div className="pt-2 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="time_limit_seconds" className="text-xs flex items-center gap-1 text-foreground font-medium">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Лимит времени (сек)
                  </Label>
                  <Input
                    id="time_limit_seconds"
                    type="number"
                    min={5}
                    max={600}
                    placeholder="По умолчанию (30 сек)"
                    className="h-8 text-xs"
                    {...register("time_limit_seconds")}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="error_limit" className="text-xs text-foreground font-medium flex items-center justify-between">
                    <span>Допустимое количество ошибок</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      По умолчанию: {defaultErrors}
                    </span>
                  </Label>
                  <Input
                    id="error_limit"
                    type="number"
                    min={0}
                    max={10}
                    placeholder={`По умолчанию: ${defaultErrors} (от сложности)`}
                    className="h-8 text-xs"
                    {...register("error_limit")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    По умолчанию для выбранной сложности: {defaultErrors}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t py-3 px-6">
            <div className="flex flex-col gap-0.5">
              <div className="text-sm font-semibold text-foreground">
                Будет доступно билетов:{" "}
                <span className={isNoTickets ? "text-destructive font-bold" : "text-primary font-bold"}>
                  {totalAvailableTickets}
                </span>
              </div>
              {isNoTickets && (
                <div className="text-xs text-destructive font-medium flex items-center gap-1.5 mt-0.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Выберите другую категорию или подготовьте билеты</span>
                </div>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              title={isNoTickets ? "Выберите другую категорию или подготовьте билеты" : undefined}
              size="lg"
              className="w-full sm:w-auto h-11 px-7 text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Создание занятия...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
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
