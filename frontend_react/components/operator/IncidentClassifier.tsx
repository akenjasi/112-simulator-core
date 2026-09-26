"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { X, Search } from "lucide-react"
import { calculateLocalServices, matchCanonicalService } from "./services-data"

const border = "#c9ced1"
const slate = "#49555d"
const blue = "#157dbd"
const muted = "#9aa3a9"

export interface IncidentClassifierProps {
  incidentType: string | null
  onAggregatedUpdate?: (aggregatedText: string) => void
  onSelectType?: (type: string | null) => void
  onRecommendedServices?: (services: string[]) => void
}

export const DEFAULT_INCIDENT_CATEGORIES: string[] = [
  "101",
  "102",
  "103",
  "104",
  "Аварии и происшествия в городском хозяйстве",
  "Аварии и происшествия на транспортных объектах",
  "Аварии на гидротехнических сооружениях",
  "Аварии на опасных и производственных объектах",
  "Взрывы",
  "ДТП",
  "Запах газа",
  "Нарушение правопорядка",
  "Обрушения",
  "Оказание медицинской скорой и неотложной помощи",
  "Опасные геологические, гидрологические и метеорологические явления",
  "Пожары и задымления",
  "Проблемы на дороге",
  "Происшествия с участием животных",
  "Прочие происшествия",
  "Ребенок в опасности",
  "Смертельный исход человека",
  "Социальная помощь",
  "Угрозы взрывов и террористических актов",
  "Угрозы выброса опасных веществ",
  "Угрозы обрушений",
  "Человек в опасности",
  "Экологические происшествия",
  "Отмена вызова",
  "Тестовый вызов",
  "Передача дежурства",
  "Консультация",
  "Вызов на иностранном языке",
  "Ошибочно набран номер",
  "Справка-101",
  "Справка-102",
  "Справка-103",
  "Аварии на объектах метрополитена",
  "Аварии на МЦК",
  "Аварии на объектах железнодорожного транспорта",
  "Аварии на объектах водного транспорта",
  "Аварии на объектах воздушного транспорта",
  "БПЛА",
  "Граждане с оружием",
  "Драка",
  "Зажало, придавило",
  "Заложники",
  "Подозрительный предмет",
  "Попытка самоубийства",
  "Потерялся человек",
  "Провал грунта",
  "Служба ЦОДД",
]

export const QUICK_INCIDENT_BUTTONS: string[] = [
  "Отмена вызова",
  "Тестовый вызов",
  "Передача дежурства",
  "ДТП",
  "Консультация",
  "Вызов на иностранном языке",
  "Ошибочно набран номер",
  "Справка-101",
  "Справка-102",
  "Справка-103",
]

function Pill({
  children,
  active,
  onClick,
  multiline,
  className = "",
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  multiline?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] 2xl:text-[13px] leading-tight text-center transition-colors cursor-pointer select-none rounded-[1px] active:scale-[0.98] ${
        active ? "shadow-sm font-semibold" : "hover:bg-gray-100"
      } ${className}`}
      style={{
        padding: multiline ? "5px 10px" : "6px 11px",
        border: `1px solid ${active ? blue : border}`,
        background: active ? blue : "#fbfdfe",
        color: active ? "#fff" : slate,
        whiteSpace: multiline ? "normal" : "nowrap",
      }}
    >
      {children}
    </button>
  )
}

function QuestionnaireRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5 py-2.5 items-start">
      <div
        className="text-[13px] pt-1 font-medium select-none shrink-0"
        style={{ color: muted, width: 160 }}
      >
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1 items-center">{children}</div>
    </div>
  )
}

function YesNoRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: "Да" | "Нет" | null
  onChange: (val: "Да" | "Нет" | null) => void
}) {
  return (
    <QuestionnaireRow label={label}>
      <Pill
        active={value === "Да"}
        onClick={() => onChange(value === "Да" ? null : "Да")}
      >
        Да
      </Pill>
      <Pill
        active={value === "Нет"}
        onClick={() => onChange(value === "Нет" ? null : "Нет")}
      >
        Нет
      </Pill>
    </QuestionnaireRow>
  )
}

function normalizeType(type: string | null): "101" | "103" | "104" | "generic" {
  if (!type) return "generic"
  const clean = type.toLowerCase().trim()
  if (
    clean.includes("справка") ||
    clean.includes("консультация") ||
    clean.includes("тест") ||
    clean.includes("отмена") ||
    clean.includes("передача") ||
    clean.includes("ошибочно")
  ) {
    return "generic"
  }
  if (clean === "101" || clean.includes("101") || clean.includes("пожар")) return "101"
  if (clean === "103" || clean.includes("103") || clean.includes("скор")) return "103"
  if (clean === "104" || clean.includes("104") || clean.includes("газ")) return "104"
  return "generic"
}

export function IncidentClassifier({
  incidentType,
  onAggregatedUpdate,
  onSelectType,
  onRecommendedServices,
}: IncidentClassifierProps) {
  const [currentType, setCurrentType] = useState<string | null>(incidentType ?? null)

  useEffect(() => {
    setCurrentType(incidentType ?? null)
  }, [incidentType])

  const [categories, setCategories] = useState<string[]>(DEFAULT_INCIDENT_CATEGORIES)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const comboboxRef = useRef<HTMLDivElement>(null)

  // Fetch categories if available
  useEffect(() => {
    let isCancelled = false
    async function loadCategories() {
      try {
        const res = await fetch("/api/v1/classifier/categories")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0 && !isCancelled) {
            const set = new Set(["101", "102", "103", "104", ...data])
            setCategories(Array.from(set))
          }
        }
      } catch {
        // Fallback to DEFAULT_INCIDENT_CATEGORIES
      }
    }
    loadCategories()
    return () => {
      isCancelled = true
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const handleSelect = (type: string | null) => {
    setCurrentType(type)
    setSearchTerm("")
    setIsDropdownOpen(false)
    if (!type) {
      setF101({
        where: "",
        fireSign: "",
        subObject: "",
        locationPlace: "",
        threat: null,
        medical: null,
        evacuation: null,
        gasification: null,
      })
      setF103({
        lastName: "",
        firstName: "",
        middleName: "",
        birthDate: "",
        age: "",
        gender: "",
        refusal: false,
        threat: null,
        medical: null,
      })
      setF104({
        smellWhere: "",
        incidentSign: "",
        victimStatus: "",
        threat: null,
        medical: null,
        evacuation: null,
      })
      setFGeneric({
        threat: null,
        victims: null,
        details: "",
      })
      onAggregatedUpdate?.("")
    }
    onSelectType?.(type)
  }

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories
    const term = searchTerm.toLowerCase().trim()
    return categories.filter((cat) => cat.toLowerCase().includes(term))
  }, [categories, searchTerm])

  const category = useMemo(() => normalizeType(currentType), [currentType])

  // --- State for 101 ---
  const [f101, setF101] = useState<{
    where: string
    fireSign: string
    subObject: string
    locationPlace: string
    threat: "Да" | "Нет" | null
    medical: "Да" | "Нет" | null
    evacuation: "Да" | "Нет" | null
    gasification: "Да" | "Нет" | null
  }>({
    where: "",
    fireSign: "",
    subObject: "",
    locationPlace: "",
    threat: null,
    medical: null,
    evacuation: null,
    gasification: null,
  })

  // --- State for 103 ---
  const [f103, setF103] = useState<{
    lastName: string
    firstName: string
    middleName: string
    birthDate: string
    age: string
    gender: "Мужчина" | "Женщина" | ""
    refusal: boolean
    threat: "Да" | "Нет" | null
    medical: "Да" | "Нет" | null
  }>({
    lastName: "",
    firstName: "",
    middleName: "",
    birthDate: "",
    age: "",
    gender: "",
    refusal: false,
    threat: null,
    medical: null,
  })

  // --- State for 104 ---
  const [f104, setF104] = useState<{
    smellWhere: string
    incidentSign: string
    victimStatus: string
    threat: "Да" | "Нет" | null
    medical: "Да" | "Нет" | null
    evacuation: "Да" | "Нет" | null
  }>({
    smellWhere: "",
    incidentSign: "",
    victimStatus: "",
    threat: null,
    medical: null,
    evacuation: null,
  })

  // --- State for Generic ---
  const [fGeneric, setFGeneric] = useState<{
    threat: "Да" | "Нет" | null
    victims: "Да" | "Нет" | null
    details: string
  }>({
    threat: null,
    victims: null,
    details: "",
  })

  // Aggregation string builder
  const getAggregatedText = (): string => {
    if (category === "101") {
      const parts: string[] = []
      if (f101.where) parts.push(`Где: ${f101.where}`)
      if (f101.fireSign) parts.push(`Признак пожара: ${f101.fireSign}`)
      if (f101.where === "Улица") {
        if (f101.subObject) parts.push(`Улица (пламя, дым): ${f101.subObject}`)
        if (f101.locationPlace) parts.push(`Место происшествия: ${f101.locationPlace}`)
      } else if (f101.where === "Дом") {
        if (f101.subObject) parts.push(`Дом (пламя): ${f101.subObject}`)
      } else if (f101.where === "Транспорт") {
        if (f101.subObject) parts.push(`Транспорт: ${f101.subObject}`)
      } else if (f101.subObject) {
        parts.push(`Объект: ${f101.subObject}`)
      }
      if (f101.threat) parts.push(`Угроза людям: ${f101.threat}`)
      if (f101.medical) parts.push(`Медицинская помощь: ${f101.medical}`)
      if (f101.evacuation) parts.push(`Требуется эвакуация: ${f101.evacuation}`)
      if (f101.gasification) parts.push(`Проведена ли газификация: ${f101.gasification}`)
      return parts.length ? parts.join(". ") + "." : ""
    }

    if (category === "103") {
      const parts: string[] = []
      if (f103.lastName) parts.push(`Фамилия: ${f103.lastName}`)
      if (f103.firstName) parts.push(`Имя: ${f103.firstName}`)
      if (f103.middleName) parts.push(`Отчество: ${f103.middleName}`)
      if (f103.birthDate) parts.push(`Дата рождения: ${f103.birthDate}`)
      if (f103.age) parts.push(`Возраст: ${f103.age}`)
      if (f103.gender) parts.push(`Пол: ${f103.gender}`)
      if (f103.refusal) parts.push(`Отказ от реагирования Скорой: Да`)
      if (f103.threat) parts.push(`Угроза людям: ${f103.threat}`)
      if (f103.medical) parts.push(`Медицинская помощь: ${f103.medical}`)
      return parts.length ? parts.join(". ") + "." : ""
    }

    if (category === "104") {
      const parts: string[] = []
      if (f104.smellWhere) parts.push(`Где ощущается запах: ${f104.smellWhere}`)
      if (f104.incidentSign) parts.push(`Признаки происшествия: ${f104.incidentSign}`)
      if (f104.victimStatus) parts.push(`Пострадавший: ${f104.victimStatus}`)
      if (f104.threat) parts.push(`Угроза людям: ${f104.threat}`)
      if (f104.medical) parts.push(`Медицинская помощь: ${f104.medical}`)
      if (f104.evacuation) parts.push(`Требуется эвакуация: ${f104.evacuation}`)
      return parts.length ? parts.join(". ") + "." : ""
    }

    // Generic
    const parts: string[] = []
    if (fGeneric.threat) parts.push(`Угроза людям: ${fGeneric.threat}`)
    if (fGeneric.victims) parts.push(`Есть ли пострадавшие: ${fGeneric.victims}`)
    if (fGeneric.details) parts.push(`Детали происшествия: ${fGeneric.details}`)
    return parts.length ? parts.join(". ") + "." : ""
  }

  const onUpdateRef = useRef(onAggregatedUpdate)
  useEffect(() => {
    onUpdateRef.current = onAggregatedUpdate
  }, [onAggregatedUpdate])

  const onRecommendedServicesRef = useRef(onRecommendedServices)
  useEffect(() => {
    onRecommendedServicesRef.current = onRecommendedServices
  }, [onRecommendedServices])

  const calculateAndNotifyServices = useCallback(
    async (typeToCalculate: string | null) => {
      if (!typeToCalculate) return

      const tags: string[] = []
      if (category === "101") {
        if (f101.where) tags.push(f101.where)
        if (f101.fireSign) tags.push(f101.fireSign)
        if (f101.subObject) tags.push(f101.subObject)
        if (f101.locationPlace) tags.push(f101.locationPlace)
        if (f101.threat === "Да") tags.push("Угроза людям")
        if (f101.medical === "Да") tags.push("Медицинская помощь: Да")
        if (f101.evacuation === "Да") tags.push("Требуется эвакуация")
        if (f101.gasification === "Да") tags.push("Газификация: Да")
      } else if (category === "103") {
        if (f103.refusal) tags.push("Отказ от скорой")
        if (f103.threat === "Да") tags.push("Угроза людям")
        if (f103.medical === "Да") tags.push("Медицинская помощь: Да")
      } else if (category === "104") {
        if (f104.smellWhere) tags.push(f104.smellWhere)
        if (f104.incidentSign) tags.push(f104.incidentSign)
        if (f104.victimStatus) tags.push(f104.victimStatus)
        if (f104.threat === "Да") tags.push("Угроза людям")
        if (f104.medical === "Да") tags.push("Медицинская помощь: Да")
        if (f104.evacuation === "Да") tags.push("Требуется эвакуация")
      } else {
        if (fGeneric.threat === "Да") tags.push("Угроза людям")
        if (fGeneric.victims === "Да") tags.push("Есть пострадавшие")
        if (fGeneric.details) tags.push(fGeneric.details)
      }

      const hasVictims =
        f101.medical === "Да" ||
        f104.victimStatus === "Есть пострадавшие" ||
        f104.medical === "Да" ||
        fGeneric.victims === "Да" ||
        typeToCalculate.includes("103")
      const isBlocked =
        f101.subObject === "лифт" ||
        tags.some((t) => t.toLowerCase().includes("заблокир") || t.toLowerCase().includes("лифт") || t.toLowerCase().includes("нет доступа"))
      const isFire =
        typeToCalculate.includes("101") ||
        typeToCalculate.toLowerCase().includes("пожар") ||
        !!f101.fireSign ||
        tags.some((t) => t.toLowerCase().includes("пламя") || t.toLowerCase().includes("дым"))

      // 1. Instant client-side calculation for fast feedback
      const local = calculateLocalServices({
        finalType: typeToCalculate,
        category: typeToCalculate,
        hasVictims,
        isBlocked,
        isFire,
        tags,
      })
      if (local && local.length > 0) {
        onRecommendedServicesRef.current?.(local)
      }

      // Check if non-emergency incident (e.g. Отмена вызова)
      const isNonEmergency = [
        "отмена вызова",
        "тестовый вызов",
        "передача дежурства",
        "консультация",
        "вызов на иностранном языке",
        "ошибочно набран номер",
        "справка-101",
        "справка-102",
        "справка-103",
      ].some((ne) => typeToCalculate.toLowerCase().includes(ne))

      if (isNonEmergency && !isFire && !hasVictims && !isBlocked) {
        return
      }

      // 2. Integration with backend POST /api/v1/classifier/calculate per TZ 56
      try {
        const res = await fetch("/api/v1/classifier/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_type: typeToCalculate,
            category: typeToCalculate,
            has_victims: hasVictims,
            is_blocked: isBlocked,
            is_fire: isFire,
            tags,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            const mapped = data
              .map((s: string) => matchCanonicalService(s))
              .filter(Boolean)
            if (mapped.length > 0) {
              onRecommendedServicesRef.current?.(mapped)
            }
          }
        }
      } catch (err) {
        // Fallback already delivered
        console.debug("Backend calculation request handled locally:", err)
      }
    },
    [category, f101, f103, f104, fGeneric]
  )

  const isMounted = useRef(false)

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    const text = getAggregatedText()
    onUpdateRef.current?.(text)
    if (currentType) {
      calculateAndNotifyServices(currentType)
    }
  }, [category, currentType, f101, f103, f104, fGeneric, calculateAndNotifyServices])

  // Header with incident title and reset cross button (X)
  const incidentTitle = currentType
    ? currentType.startsWith("Происшествие")
      ? currentType
      : `Происшествие ${currentType}`
    : ""

  const renderHeader = () => (
    <div
      className="flex items-center justify-between px-3.5 py-1.5 mb-2.5 select-none rounded-[1px]"
      style={{ background: "#303335" }}
    >
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className="text-[13px] 2xl:text-[14px] font-bold text-white underline decoration-white/60 underline-offset-4 hover:text-white/80 transition cursor-pointer text-left flex items-center gap-1.5"
        title="Сбросить тип происшествия (вернуться к выбору)"
      >
        <span>{incidentTitle}</span>
      </button>
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className="text-white/80 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-white/10"
        title="Сбросить тип происшествия"
        aria-label="Сбросить тип происшествия"
      >
        <X size={18} />
      </button>
    </div>
  )

  // ==========================================
  // RENDER INITIAL EMPTY STATE (WHEN NULL)
  // ==========================================
  if (!currentType) {
    return (
      <div className="flex flex-col gap-3 py-1 w-full" ref={comboboxRef}>
        <div className="text-[12px] 2xl:text-[13px] text-[#6b7280] font-normal select-none">
          Введите тип происшествия
        </div>

        {/* Autocomplete Combobox Input */}
        <div className="relative w-full">
          <input
            type="text"
            role="combobox"
            aria-expanded={isDropdownOpen}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsDropdownOpen(true)
            }}
            onClick={() => setIsDropdownOpen(true)}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (filteredCategories.length > 0) {
                  handleSelect(filteredCategories[0])
                } else if (searchTerm.trim()) {
                  handleSelect(searchTerm.trim())
                }
              } else if (e.key === "Escape") {
                setIsDropdownOpen(false)
              }
            }}
            placeholder="что случилось?"
            className="w-full text-sm md:text-base px-3.5 py-2.5 border border-[#c9ced1] rounded-[2px] bg-white text-[#49555d] outline-none focus:border-[#157dbd] focus:ring-1 focus:ring-[#157dbd] shadow-sm transition-all"
          />

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#c9ced1] shadow-lg rounded-[2px] max-h-64 overflow-y-auto z-50 divide-y divide-gray-100">
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    className="w-full text-left px-3.5 py-2 text-xs md:text-sm text-[#49555d] hover:bg-blue-50 hover:text-[#157dbd] cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] text-gray-400">ЕКП</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-400 italic">
                  Ничего не найдено
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Buttons Block */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_INCIDENT_BUTTONS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => handleSelect(label)}
              className="text-[12px] 2xl:text-[13px] leading-tight px-2.5 py-1.5 border border-[#c9ced1] bg-[#fbfdfe] hover:bg-gray-100 active:scale-95 text-[#49555d] rounded-[1px] transition cursor-pointer select-none"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ==========================================
  // RENDER 101: ПОЖАР (PROGRESSIVE DISCLOSURE)
  // ==========================================
  if (category === "101") {
    const whereOptions = ["Улица", "Транспорт", "Дом", "Здание/объект", "Опасный объект"]

    return (
      <div className="flex flex-col">
        {renderHeader()}
        <div className="divide-y text-xs select-none" style={{ borderColor: border }}>
        {/* Шаг 1: Где */}
        <QuestionnaireRow label="Где">
          {whereOptions.map((opt) => (
            <Pill
              key={opt}
              active={f101.where === opt}
              onClick={() =>
                setF101((prev) => ({
                  ...prev,
                  where: prev.where === opt ? "" : opt,
                  fireSign: "",
                  subObject: "",
                  locationPlace: "",
                }))
              }
            >
              {opt}
            </Pill>
          ))}
        </QuestionnaireRow>

        {/* Шаг 2: Признак пожара (появляется при выборе локации) */}
        {f101.where && (
          <QuestionnaireRow label={`Признак пожара (${f101.where.toLowerCase()})`}>
            {["Открытое пламя / Дым", "Запах гари"].map((sign) => (
              <Pill
                key={sign}
                active={f101.fireSign === sign}
                onClick={() =>
                  setF101((prev) => ({
                    ...prev,
                    fireSign: prev.fireSign === sign ? "" : sign,
                    subObject: "",
                  }))
                }
              >
                {sign}
              </Pill>
            ))}
            {f101.where === "Дом" && (
              <Pill
                active={f101.fireSign === "Сработала пожарная сигнализация"}
                onClick={() =>
                  setF101((prev) => ({
                    ...prev,
                    fireSign:
                      prev.fireSign === "Сработала пожарная сигнализация"
                        ? ""
                        : "Сработала пожарная сигнализация",
                  }))
                }
              >
                Сработала пожарная сигнализация
              </Pill>
            )}
          </QuestionnaireRow>
        )}

        {/* Шаг 3: Детали происшествия и контрольные вопросы */}
        {f101.where && f101.fireSign && (
          <>
            {/* Блок объектов для Улицы */}
            {f101.where === "Улица" && (
              <>
                <QuestionnaireRow label="Улица (пламя, дым)">
                  {["Мусор", "Трава", "Лес", "Стройплощадка", "Коллектор", "Свалка", "Прочее"].map(
                    (obj) => (
                      <Pill
                        key={obj}
                        active={f101.subObject === obj}
                        onClick={() =>
                          setF101((prev) => ({
                            ...prev,
                            subObject: prev.subObject === obj ? "" : obj,
                          }))
                        }
                      >
                        {obj}
                      </Pill>
                    )
                  )}
                </QuestionnaireRow>

                <QuestionnaireRow label="Место происшествия">
                  {["Тоннель", "Мост", "Парк", "Двор", "Остановка", "Дорога", "Тротуар"].map(
                    (plc) => (
                      <Pill
                        key={plc}
                        active={f101.locationPlace === plc}
                        onClick={() =>
                          setF101((prev) => ({
                            ...prev,
                            locationPlace: prev.locationPlace === plc ? "" : plc,
                          }))
                        }
                      >
                        {plc}
                      </Pill>
                    )
                  )}
                </QuestionnaireRow>
              </>
            )}

            {/* Блок объектов для Дома */}
            {f101.where === "Дом" && (
              <QuestionnaireRow label="Дом (пламя)">
                {[
                  "квартира",
                  "балкон",
                  "газовая колонка",
                  "газовая плита",
                  "лифт",
                  "мусоропровод",
                  "подъезд",
                  "счетчик электричества",
                  "частный дом",
                  "подвал",
                ].map((obj) => (
                  <Pill
                    key={obj}
                    active={f101.subObject === obj}
                    onClick={() =>
                      setF101((prev) => ({
                        ...prev,
                        subObject: prev.subObject === obj ? "" : obj,
                      }))
                    }
                  >
                    {obj}
                  </Pill>
                ))}
              </QuestionnaireRow>
            )}

            {/* Блок объектов для Транспорта */}
            {f101.where === "Транспорт" && (
              <QuestionnaireRow label="Транспорт (пламя)">
                {[
                  "Легковой автомобиль",
                  "Грузовой автомобиль",
                  "Автобус / маршрутка",
                  "Электробус / трамвай",
                  "Поезд / метро",
                  "Мотоцикл",
                ].map((obj) => (
                  <Pill
                    key={obj}
                    active={f101.subObject === obj}
                    onClick={() =>
                      setF101((prev) => ({
                        ...prev,
                        subObject: prev.subObject === obj ? "" : obj,
                      }))
                    }
                  >
                    {obj}
                  </Pill>
                ))}
              </QuestionnaireRow>
            )}

            {/* Блок объектов для Здания/Объекта */}
            {(f101.where === "Здание/объект" || f101.where === "Опасный объект") && (
              <QuestionnaireRow label="Объект">
                {["Торговый центр", "Школа / детсад", "Больница", "Склад", "Производство", "АЗС"].map(
                  (obj) => (
                    <Pill
                      key={obj}
                      active={f101.subObject === obj}
                      onClick={() =>
                        setF101((prev) => ({
                          ...prev,
                          subObject: prev.subObject === obj ? "" : obj,
                        }))
                      }
                    >
                      {obj}
                    </Pill>
                  )
                )}
              </QuestionnaireRow>
            )}

            {/* Контрольные вопросы 101 */}
            <YesNoRow
              label="Угроза людям"
              value={f101.threat}
              onChange={(val) => setF101((prev) => ({ ...prev, threat: val }))}
            />
            <YesNoRow
              label="Медицинская помощь"
              value={f101.medical}
              onChange={(val) => setF101((prev) => ({ ...prev, medical: val }))}
            />
            <YesNoRow
              label="Требуется эвакуация"
              value={f101.evacuation}
              onChange={(val) => setF101((prev) => ({ ...prev, evacuation: val }))}
            />
            <YesNoRow
              label="Проведена ли газификация"
              value={f101.gasification}
              onChange={(val) => setF101((prev) => ({ ...prev, gasification: val }))}
            />
          </>
        )}
        </div>
      </div>
    )
  }

  // ==========================================
  // RENDER 103: СКОРАЯ ПОМОЩЬ
  // ==========================================
  if (category === "103") {
    return (
      <div className="flex flex-col">
        {renderHeader()}
        <div className="divide-y text-xs" style={{ borderColor: border }}>
        {/* Данные пациента */}
        <div className="py-2.5 space-y-2">
          <div className="text-[13px] font-semibold" style={{ color: slate }}>
            Данные пациента
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Фамилия"
              value={f103.lastName}
              onChange={(e) => setF103((prev) => ({ ...prev, lastName: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border rounded-[1px] outline-none focus:border-[#157dbd]"
              style={{ borderColor: border, color: slate }}
            />
            <input
              type="text"
              placeholder="Имя"
              value={f103.firstName}
              onChange={(e) => setF103((prev) => ({ ...prev, firstName: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border rounded-[1px] outline-none focus:border-[#157dbd]"
              style={{ borderColor: border, color: slate }}
            />
            <input
              type="text"
              placeholder="Отчество"
              value={f103.middleName}
              onChange={(e) => setF103((prev) => ({ ...prev, middleName: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border rounded-[1px] outline-none focus:border-[#157dbd]"
              style={{ borderColor: border, color: slate }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Дата рождения"
              value={f103.birthDate}
              onChange={(e) => setF103((prev) => ({ ...prev, birthDate: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border rounded-[1px] outline-none focus:border-[#157dbd]"
              style={{ borderColor: border, color: slate }}
            />
            <input
              type="text"
              placeholder="Возраст"
              value={f103.age}
              onChange={(e) => setF103((prev) => ({ ...prev, age: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border rounded-[1px] outline-none focus:border-[#157dbd]"
              style={{ borderColor: border, color: slate }}
            />
          </div>
        </div>

        {/* Пол */}
        <QuestionnaireRow label="Пол">
          {["Мужчина", "Женщина"].map((g) => (
            <Pill
              key={g}
              active={f103.gender === g}
              onClick={() =>
                setF103((prev) => ({ ...prev, gender: prev.gender === g ? "" : (g as any) }))
              }
            >
              {g}
            </Pill>
          ))}
        </QuestionnaireRow>

        {/* Отказ от реагирования Скорой */}
        <div className="py-2.5">
          <Pill
            active={f103.refusal}
            onClick={() => setF103((prev) => ({ ...prev, refusal: !prev.refusal }))}
            className="w-full text-center py-2"
          >
            Отказ от реагирования Скорой
          </Pill>
        </div>

        {/* Контрольные вопросы 103 */}
        <YesNoRow
          label="Угроза людям"
          value={f103.threat}
          onChange={(val) => setF103((prev) => ({ ...prev, threat: val }))}
        />
        <YesNoRow
          label="Медицинская помощь"
          value={f103.medical}
          onChange={(val) => setF103((prev) => ({ ...prev, medical: val }))}
        />
        </div>
      </div>
    )
  }

  // ==========================================
  // RENDER 104: ГАЗ (МОСГАЗ)
  // ==========================================
  if (category === "104") {
    return (
      <div className="flex flex-col">
        {renderHeader()}
        <div className="divide-y text-xs select-none" style={{ borderColor: border }}>
        {/* Где ощущается запах */}
        <QuestionnaireRow label="Где ощущается запах">
          {["Вне помещения", "В помещении"].map((loc) => (
            <Pill
              key={loc}
              active={f104.smellWhere === loc}
              onClick={() =>
                setF104((prev) => ({
                  ...prev,
                  smellWhere: prev.smellWhere === loc ? "" : loc,
                }))
              }
            >
              {loc}
            </Pill>
          ))}
        </QuestionnaireRow>

        {/* Признаки происшествия */}
        {f104.smellWhere && (
          <>
            <QuestionnaireRow label="Признаки происшествия">
              {[
                "Нарушение в работе",
                "Повреждение",
                "Запах газа в квартире",
                "Запах газа в подъезде",
                "Утечка газа",
                "Взрыв бытового газа",
              ].map((sign) => (
                <Pill
                  key={sign}
                  active={f104.incidentSign === sign}
                  onClick={() =>
                    setF104((prev) => ({
                      ...prev,
                      incidentSign: prev.incidentSign === sign ? "" : sign,
                    }))
                  }
                >
                  {sign}
                </Pill>
              ))}
            </QuestionnaireRow>

            {/* Пострадавший */}
            <QuestionnaireRow label="Пострадавший">
              {[
                "Пострадавший не на месте",
                "Отказ от Скорой",
                "Без пострадавших",
                "Есть пострадавшие",
              ].map((status) => (
                <Pill
                  key={status}
                  active={f104.victimStatus === status}
                  onClick={() =>
                    setF104((prev) => ({
                      ...prev,
                      victimStatus: prev.victimStatus === status ? "" : status,
                    }))
                  }
                >
                  {status}
                </Pill>
              ))}
            </QuestionnaireRow>

            <YesNoRow
              label="Угроза людям"
              value={f104.threat}
              onChange={(val) => setF104((prev) => ({ ...prev, threat: val }))}
            />
            <YesNoRow
              label="Медицинская помощь"
              value={f104.medical}
              onChange={(val) => setF104((prev) => ({ ...prev, medical: val }))}
            />
            <YesNoRow
              label="Требуется эвакуация"
              value={f104.evacuation}
              onChange={(val) => setF104((prev) => ({ ...prev, evacuation: val }))}
            />
          </>
        )}
        </div>
      </div>
    )
  }

  // ==========================================
  // RENDER GENERIC FALLBACK: ПРОЧИЕ
  // ==========================================
  return (
    <div className="flex flex-col">
      {renderHeader()}
      <div className="divide-y text-xs" style={{ borderColor: border }}>
        <YesNoRow
          label="Угроза людям"
          value={fGeneric.threat}
          onChange={(val) => setFGeneric((prev) => ({ ...prev, threat: val }))}
        />
        <YesNoRow
          label="Есть ли пострадавшие"
          value={fGeneric.victims}
          onChange={(val) => setFGeneric((prev) => ({ ...prev, victims: val }))}
        />

        <div className="py-2.5">
          <label
            htmlFor="incident-details"
            className="text-[13px] font-medium block mb-1.5"
            style={{ color: muted }}
          >
            Детали происшествия
          </label>
          <textarea
            id="incident-details"
            role="textbox"
            rows={4}
            value={fGeneric.details}
            onChange={(e) => setFGeneric((prev) => ({ ...prev, details: e.target.value }))}
            placeholder="Детали происшествия..."
            className="w-full text-xs p-2.5 border rounded-[1px] outline-none focus:border-[#157dbd] resize-none"
            style={{ borderColor: border, color: slate }}
          />
        </div>
      </div>
    </div>
  )
}

export default IncidentClassifier
