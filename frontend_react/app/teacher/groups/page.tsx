"use client"

import { apiFetch as fetch } from "@/lib/api-fetch"

import React, { useState, useEffect, useCallback, useMemo } from "react"
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
import { Select, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dropzone } from "@/components/ui/dropzone"
import {
  Users,
  UserPlus,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderPlus,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Trash2,
  Download,
  UserCheck,
  Search,
  Check,
  X,
  Calendar,
  AlertTriangle,
} from "lucide-react"

export interface StudentGroup {
  group_id: string
  group_name: string
  department?: string | null
  cadet_ids: string[]
  created_at?: string
  is_active?: boolean
}

export interface StudentItem {
  user_id: string
  id?: string
  student_id?: string
  username: string
  email?: string
  full_name?: string | null
  role: string
  groups?: string[]
  is_active?: boolean
  created_at?: string
}

export interface BulkLinkResult {
  user_id: string
  status: "success" | "already_in_group" | "error"
  error?: string | null
}

/**
 * Splits full_name string into lastName, firstName, middleName.
 * Handles cases where full_name has 1, 2, 3+ words or is empty/null.
 */
export function splitFullName(fullName?: string | null, username?: string): {
  lastName: string
  firstName: string
  middleName: string
} {
  const nameToSplit = (fullName && fullName.trim()) || (username && username.trim()) || ""
  if (!nameToSplit) {
    return { lastName: "—", firstName: "—", middleName: "—" }
  }
  const parts = nameToSplit.split(/\s+/)
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: "—", middleName: "—" }
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: "—" }
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  }
}

/**
 * Localizes user roles from system codes (CADET, TEACHER, ADMIN) to Russian.
 */
export function formatRole(role?: string): string {
  if (!role) return "Ученик"
  const upper = role.toUpperCase()
  if (upper === "CADET" || upper === "STUDENT") return "Ученик"
  if (upper === "TEACHER") return "Преподаватель"
  if (upper === "ADMIN") return "Администратор"
  return role
}

/**
 * Formats ISO date string to DD.MM.YYYY.
 */
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return "—"
  }
}

export default function GroupsPage() {
  const [activeTab, setActiveTab] = useState<"groups" | "all_students">("groups")

  // Groups states
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Creation modal & form states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<"create_group" | "link_catalog" | "upload_csv">("create_group")
  const [groupName, setGroupName] = useState("")
  const [department, setDepartment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV upload states
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Accordion & expanded group students
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({})
  const [groupStudents, setGroupStudents] = useState<Record<string, StudentItem[]>>({})
  const [loadingGroupStudents, setLoadingGroupStudents] = useState<Record<string, boolean>>({})

  // Catalog picker modal states
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false)
  const [catalogTargetGroupId, setCatalogTargetGroupId] = useState<string>("")
  const [catalogSearch, setCatalogSearch] = useState("")
  const [catalogOnlyWithoutGroup, setCatalogOnlyWithoutGroup] = useState(false)
  const [selectedCatalogUserIds, setSelectedCatalogUserIds] = useState<string[]>([])
  const [isLinkingStudents, setIsLinkingStudents] = useState(false)

  // Student removal confirmation modal states
  const [confirmRemoveStudent, setConfirmRemoveStudent] = useState<{
    groupId: string
    groupName: string
    student: StudentItem
  } | null>(null)
  const [isRemovingStudent, setIsRemovingStudent] = useState(false)

  // All students tab states
  const [allStudents, setAllStudents] = useState<StudentItem[]>([])
  const [loadingAllStudents, setLoadingAllStudents] = useState<boolean>(false)
  const [studentSearch, setStudentSearch] = useState<string>("")
  const [filterGroupId, setFilterGroupId] = useState<string>("")
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [bulkTargetGroupId, setBulkTargetGroupId] = useState<string>("")
  const [isBulkAdding, setIsBulkAdding] = useState<boolean>(false)

  // Authentication headers helper
  const getAuthHeaders = useCallback((): HeadersInit => {
    if (typeof window === "undefined") return {}
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  // Fetch groups from backend
  const loadGroups = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/v1/groups", {
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        throw new Error(`Ошибка загрузки списка групп (${res.status})`)
      }
      const data = await res.json()
      const groupList: StudentGroup[] = Array.isArray(data) ? data : []
      setGroups(groupList)
      setSelectedGroupId((prev) => {
        if (prev && groupList.some((g) => g.group_id === prev)) {
          return prev
        }
        return groupList.length > 0 ? groupList[0].group_id : ""
      })
      if (!bulkTargetGroupId && groupList.length > 0) {
        setBulkTargetGroupId(groupList[0].group_id)
      }
      if (!catalogTargetGroupId && groupList.length > 0) {
        setCatalogTargetGroupId(groupList[0].group_id)
      }
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить список групп")
    } finally {
      setIsLoading(false)
    }
  }, [bulkTargetGroupId, catalogTargetGroupId, getAuthHeaders])

  // Fetch students for a specific group
  const loadGroupStudents = useCallback(
    async (groupId: string) => {
      try {
        setLoadingGroupStudents((prev) => ({ ...prev, [groupId]: true }))
        const res = await fetch(`/api/v1/groups/${groupId}/students`, {
          headers: getAuthHeaders(),
        })
        if (res.ok) {
          const data = await res.json()
          setGroupStudents((prev) => ({ ...prev, [groupId]: Array.isArray(data) ? data : [] }))
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingGroupStudents((prev) => ({ ...prev, [groupId]: false }))
      }
    },
    [getAuthHeaders]
  )

  // Toggle group accordion
  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const willExpand = !prev[groupId]
      if (willExpand && !groupStudents[groupId]) {
        loadGroupStudents(groupId)
      }
      return { ...prev, [groupId]: willExpand }
    })
  }

  // Fetch all students (full catalog)
  const loadAllStudents = useCallback(async () => {
    try {
      setLoadingAllStudents(true)
      const res = await fetch("/api/v1/students", {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setAllStudents(Array.isArray(data) ? data : [])
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoadingAllStudents(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  useEffect(() => {
    if (activeTab === "all_students") {
      loadAllStudents()
    }
  }, [activeTab, loadAllStudents])

  // Helper to get group names for a student
  const getStudentGroupNames = useCallback(
    (student: StudentItem): string => {
      if (student.groups && student.groups.length > 0) {
        return student.groups.join(", ")
      }
      const matched = groups
        .filter((g) => g.cadet_ids && g.cadet_ids.includes(student.user_id))
        .map((g) => g.group_name)
      return matched.length > 0 ? matched.join(", ") : "—"
    },
    [groups]
  )

  // Helper to check if student is already in target group
  const isCadetInGroup = useCallback(
    (student: StudentItem, targetGroup?: StudentGroup) => {
      if (!targetGroup) return false
      if (targetGroup.cadet_ids && targetGroup.cadet_ids.includes(student.user_id)) {
        return true
      }
      if (
        student.groups &&
        (student.groups.includes(targetGroup.group_name) ||
          student.groups.includes(targetGroup.group_id))
      ) {
        return true
      }
      const currentList = groupStudents[targetGroup.group_id]
      if (currentList && currentList.some((s) => s.user_id === student.user_id)) {
        return true
      }
      return false
    },
    [groupStudents]
  )

  // Open Catalog Modal for a group
  const openCatalogModal = useCallback(
    async (groupId?: string) => {
      if (groupId) {
        setCatalogTargetGroupId(groupId)
      } else if (!catalogTargetGroupId && groups.length > 0) {
        setCatalogTargetGroupId(groups[0].group_id)
      }
      setSelectedCatalogUserIds([])
      setCatalogSearch("")
      setCatalogOnlyWithoutGroup(false)
      setIsCatalogModalOpen(true)
      if (allStudents.length === 0) {
        await loadAllStudents()
      }
    },
    [allStudents.length, catalogTargetGroupId, groups, loadAllStudents]
  )

  // Handle group creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return

    try {
      setIsSubmitting(true)
      setError(null)
      setSuccessMessage(null)

      const payload = {
        group_name: groupName.trim(),
        department: department.trim() || undefined,
      }

      const res = await fetch("/api/v1/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Не удалось создать группу (${res.status})`)
      }

      const newGroup: StudentGroup = await res.json()
      setGroups((prev) => [newGroup, ...prev])
      setSelectedGroupId(newGroup.group_id)
      setGroupName("")
      setDepartment("")
      setIsAddModalOpen(false)
      setSuccessMessage(`Группа "${newGroup.group_name}" успешно создана!`)
    } catch (err: any) {
      setError(err.message || "Ошибка при создании группы")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle CSV upload
  const handleUploadCsv = async () => {
    if (!selectedGroupId) {
      setError("Выберите целевую группу для импорта учеников")
      return
    }
    if (!csvFile) {
      setError("Выберите CSV файл для загрузки")
      return
    }

    try {
      setIsUploading(true)
      setError(null)
      setSuccessMessage(null)

      const formData = new FormData()
      formData.append("file", csvFile)

      const res = await fetch(`/api/v1/groups/${selectedGroupId}/students/csv`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Ошибка загрузки CSV (${res.status})`)
      }

      setSuccessMessage("Ученики успешно импортированы из CSV!")
      setCsvFile(null)
      setIsAddModalOpen(false)
      await loadGroups()
      if (expandedGroupIds[selectedGroupId]) {
        await loadGroupStudents(selectedGroupId)
      }
      await loadAllStudents()
    } catch (err: any) {
      setError(err.message || "Ошибка импорта CSV")
    } finally {
      setIsUploading(false)
    }
  }

  // Handle linking students from catalog (bulk-link)
  const handleLinkCatalogStudents = async () => {
    if (!catalogTargetGroupId) {
      setError("Выберите целевую группу для добавления курсантов")
      return
    }
    if (selectedCatalogUserIds.length === 0) {
      setError("Выберите хотя бы одного курсанта из каталога")
      return
    }

    try {
      setIsLinkingStudents(true)
      setError(null)
      setSuccessMessage(null)

      const res = await fetch(`/api/v1/groups/${catalogTargetGroupId}/students/bulk-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ user_ids: selectedCatalogUserIds }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Не удалось добавить курсантов (${res.status})`)
      }

      const results: BulkLinkResult[] = await res.json()
      const addedCount = Array.isArray(results)
        ? results.filter((r) => r.status === "success").length
        : 0
      const alreadyCount = Array.isArray(results)
        ? results.filter((r) => r.status === "already_in_group").length
        : 0
      const errorCount = Array.isArray(results)
        ? results.filter((r) => r.status === "error").length
        : 0

      if (errorCount > 0) {
        setError(
          `Результат операции: добавлено ${addedCount}, уже в группе ${alreadyCount}, ошибок ${errorCount}`
        )
      } else {
        setSuccessMessage(
          `Курсанты успешно добавлены в группу: ${addedCount}${
            alreadyCount > 0 ? ` (уже состояли: ${alreadyCount})` : ""
          }`
        )
      }

      setIsCatalogModalOpen(false)
      setSelectedCatalogUserIds([])
      await loadGroups()
      await loadGroupStudents(catalogTargetGroupId)
      await loadAllStudents()
    } catch (err: any) {
      setError(err.message || "Ошибка при добавлении курсантов в группу")
    } finally {
      setIsLinkingStudents(false)
    }
  }

  // Remove student from group (unlink)
  const handleRemoveStudent = async (groupId: string, userId: string) => {
    try {
      setIsRemovingStudent(true)
      setError(null)
      const res = await fetch(`/api/v1/groups/${groupId}/students/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || "Ошибка при исключении ученика из группы")
      }
      setSuccessMessage(
        "Ученик успешно исключен из группы (учетная запись и история результатов сохранены)"
      )
      await loadGroupStudents(groupId)
      await loadGroups()
      if (activeTab === "all_students") {
        await loadAllStudents()
      }
    } catch (err: any) {
      setError(err.message || "Ошибка при исключении ученика")
    } finally {
      setIsRemovingStudent(false)
    }
  }

  // Bulk add selected students to group from "Все ученики" tab
  const handleBulkAddToGroup = async () => {
    if (!bulkTargetGroupId) {
      setError("Выберите целевую группу")
      return
    }
    if (selectedStudentIds.length === 0) {
      setError("Выберите хотя бы одного ученика")
      return
    }

    try {
      setIsBulkAdding(true)
      setError(null)
      setSuccessMessage(null)

      const res = await fetch(`/api/v1/groups/${bulkTargetGroupId}/students/bulk-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ user_ids: selectedStudentIds }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Ошибка добавления (${res.status})`)
      }

      const results: BulkLinkResult[] = await res.json()
      const addedCount = Array.isArray(results)
        ? results.filter((r) => r.status === "success").length
        : 0
      const alreadyCount = Array.isArray(results)
        ? results.filter((r) => r.status === "already_in_group").length
        : 0
      const errorCount = Array.isArray(results)
        ? results.filter((r) => r.status === "error").length
        : 0

      if (errorCount > 0) {
        setError(
          `Результат операции: добавлено ${addedCount}, уже в группе ${alreadyCount}, ошибок ${errorCount}`
        )
      } else {
        setSuccessMessage(
          `Успешно добавлено учеников в группу: ${addedCount}${
            alreadyCount > 0 ? ` (уже состояли: ${alreadyCount})` : ""
          }`
        )
      }

      setSelectedStudentIds([])
      await loadGroups()
      if (expandedGroupIds[bulkTargetGroupId]) {
        await loadGroupStudents(bulkTargetGroupId)
      }
      await loadAllStudents()
    } catch (err: any) {
      setError(err.message || "Ошибка при массовом добавлении учеников")
    } finally {
      setIsBulkAdding(false)
    }
  }

  // Filtered students for All Students tab
  const filteredAllStudents = useMemo(() => {
    return allStudents.filter((s) => {
      const q = studentSearch.toLowerCase().trim()
      const matchesSearch =
        !q ||
        s.username.toLowerCase().includes(q) ||
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))

      if (!matchesSearch) return false

      if (!filterGroupId) return true

      const group = groups.find((g) => g.group_id === filterGroupId)
      if (!group) return true

      const inCadetIds = group.cadet_ids && group.cadet_ids.includes(s.user_id)
      const inStudentGroups =
        s.groups &&
        (s.groups.includes(group.group_name) || s.groups.includes(group.group_id))

      return inCadetIds || inStudentGroups
    })
  }, [allStudents, filterGroupId, groups, studentSearch])

  // Target group for Catalog Modal
  const catalogTargetGroup = useMemo(() => {
    return groups.find((g) => g.group_id === catalogTargetGroupId)
  }, [groups, catalogTargetGroupId])

  // Filtered students for Catalog Modal
  const filteredCatalogStudents = useMemo(() => {
    return allStudents.filter((student) => {
      const q = catalogSearch.toLowerCase().trim()
      const matchesSearch =
        !q ||
        student.username.toLowerCase().includes(q) ||
        (student.full_name && student.full_name.toLowerCase().includes(q)) ||
        (student.email && student.email.toLowerCase().includes(q))

      if (!matchesSearch) return false

      if (catalogOnlyWithoutGroup) {
        const hasAnyGroup =
          (student.groups && student.groups.length > 0) ||
          groups.some((g) => g.cadet_ids?.includes(student.user_id))
        if (hasAnyGroup) return false
      }

      return true
    })
  }, [allStudents, catalogOnlyWithoutGroup, catalogSearch, groups])

  // Available students in catalog (not already in target group)
  const availableCatalogStudents = useMemo(() => {
    if (!catalogTargetGroup) return []
    return filteredCatalogStudents.filter(
      (student) => !isCadetInGroup(student, catalogTargetGroup)
    )
  }, [catalogTargetGroup, filteredCatalogStudents, isCadetInGroup])

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Ученики и Группы
                </h1>
                <Badge variant="outline" className="text-xs">
                  Управление группами
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Формирование учебных смен и потоков, распределение курсантов по группам
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "groups" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("groups")}
            >
              <Users className="h-4 w-4 mr-1.5" />
              Группы
            </Button>
            <Button
              variant={activeTab === "all_students" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("all_students")
                loadAllStudents()
              }}
            >
              <UserCheck className="h-4 w-4 mr-1.5" />
              Все ученики
            </Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:bg-destructive/20 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 hover:bg-green-500/20 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TAB 1: GROUPS */}
      {activeTab === "groups" ? (
        <div className="space-y-6">
          {/* Action Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-5 rounded-xl border shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-foreground">Список групп</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Всего учебных групп в системе: {groups.length}. Раскройте состав группы для выбора курсантов из каталога или загрузки CSV.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="default"
                onClick={loadGroups}
                disabled={isLoading}
                title="Обновить список"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                <span className="ml-1.5 hidden sm:inline">Обновить</span>
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  setModalTab("create_group")
                  setIsAddModalOpen(true)
                }}
                className="h-10 px-5 text-sm sm:text-base font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground transition-all flex items-center gap-2"
              >
                <FolderPlus className="h-5 w-5" />
                Добавить группу
              </Button>
            </div>
          </div>

          {/* Groups List (Accordions) */}
          {isLoading && groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Загрузка групп...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
              <Users className="h-12 w-12 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-lg text-foreground">Группы пока не созданы</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Нажмите «Добавить группу», чтобы создать первую учебную группу и привязать к ней курсантов.
              </p>
              <Button
                size="lg"
                className="mt-4 h-11 px-6 text-base font-semibold shadow-md"
                onClick={() => {
                  setModalTab("create_group")
                  setIsAddModalOpen(true)
                }}
              >
                <FolderPlus className="h-5 w-5 mr-2" />
                Создать первую группу
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const studentCount = group.cadet_ids?.length || 0
                const isExpanded = !!expandedGroupIds[group.group_id]
                const students = groupStudents[group.group_id] || []
                const isLoadingStudents = loadingGroupStudents[group.group_id]

                return (
                  <div
                    key={group.group_id}
                    className="border rounded-xl overflow-hidden bg-card shadow-sm transition-all"
                  >
                    {/* Group Accordion Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleGroupExpand(group.group_id)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-base">
                              {group.group_name}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {group.department || "Без подразделения"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                          {studentCount}{" "}
                          {studentCount === 1
                            ? "ученик"
                            : studentCount >= 2 && studentCount <= 4
                            ? "ученика"
                            : "учеников"}
                        </span>
                      </div>
                    </div>

                    {/* Group Accordion Content */}
                    {isExpanded && (
                      <div className="p-4 border-t bg-muted/10 space-y-4">
                        {/* Group Actions Toolbar: Add from catalog / Import CSV */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-background border rounded-lg">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Управление составом группы
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Добавляйте существующих курсантов из каталога или загружайте списки через CSV
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedGroupId(group.group_id)
                                setModalTab("upload_csv")
                                setIsAddModalOpen(true)
                              }}
                              className="text-xs"
                            >
                              <Upload className="h-3.5 w-3.5 mr-1.5" />
                              Импорт CSV
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openCatalogModal(group.group_id)}
                              className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                              Выбрать из каталога
                            </Button>
                          </div>
                        </div>

                        {/* Students Table */}
                        {isLoadingStudents ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : students.length === 0 ? (
                          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-background space-y-3">
                            <p>В этой группе пока нет курсантов.</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCatalogModal(group.group_id)}
                            >
                              <UserPlus className="h-4 w-4 mr-1.5" />
                              Выбрать курсантов из каталога
                            </Button>
                          </div>
                        ) : (
                          <div className="border rounded-lg bg-background overflow-x-auto w-full">
                            <Table className="min-w-[600px]">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Фамилия</TableHead>
                                  <TableHead>Имя</TableHead>
                                  <TableHead>Отчество</TableHead>
                                  <TableHead>Email / Логин</TableHead>
                                  <TableHead>Роль</TableHead>
                                  <TableHead className="text-right">Действия</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {students.map((student) => {
                                  const { lastName, firstName, middleName } = splitFullName(
                                    student.full_name,
                                    student.username
                                  )
                                  return (
                                    <TableRow key={student.user_id}>
                                      <TableCell className="font-semibold text-foreground">
                                        {lastName}
                                      </TableCell>
                                      <TableCell className="text-foreground">
                                        {firstName}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {middleName}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {student.email || student.username}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-xs">
                                          {formatRole(student.role)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-destructive hover:bg-destructive/10"
                                          onClick={() =>
                                            setConfirmRemoveStudent({
                                              groupId: group.group_id,
                                              groupName: group.group_name,
                                              student,
                                            })
                                          }
                                          title="Исключить из группы"
                                          aria-label={`Исключить ${student.full_name || student.username} из группы`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: ALL STUDENTS */
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-xl">Все ученики</CardTitle>
              <CardDescription>
                Полный каталог курсантов системы с указанием учебных групп, даты регистрации и статуса
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllStudents}
              disabled={loadingAllStudents}
            >
              <RefreshCw className={`h-4 w-4 ${loadingAllStudents ? "animate-spin" : ""}`} />
              <span className="ml-1.5 hidden sm:inline">Обновить</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-muted/20 border rounded-lg">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по ФИО или Email..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Group Filter (defaults to 'Все группы') */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Группа:
                  </span>
                  <Select
                    value={filterGroupId}
                    onChange={(e) => setFilterGroupId(e.target.value)}
                    className="w-48"
                  >
                    <SelectItem value="">Все группы</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.group_id} value={g.group_id}>
                        {g.group_name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Bulk Action: Add to group via bulk-link */}
              <div className="flex items-center gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                <Select
                  value={bulkTargetGroupId}
                  onChange={(e) => setBulkTargetGroupId(e.target.value)}
                  disabled={groups.length === 0}
                  className="w-48"
                >
                  <SelectItem value="" disabled>
                    Целевая группа...
                  </SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.group_id} value={g.group_id}>
                      {g.group_name}
                    </SelectItem>
                  ))}
                </Select>
                <Button
                  onClick={handleBulkAddToGroup}
                  disabled={isBulkAdding || selectedStudentIds.length === 0 || !bulkTargetGroupId}
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {isBulkAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1" />
                  )}
                  Добавить ({selectedStudentIds.length})
                </Button>
              </div>
            </div>

            {/* Students Table */}
            {loadingAllStudents && allStudents.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredAllStudents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/10">
                Ученики не найдены
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto w-full">
                <Table className="min-w-[750px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredAllStudents.length > 0 &&
                            selectedStudentIds.length === filteredAllStudents.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIds(filteredAllStudents.map((s) => s.user_id))
                            } else {
                              setSelectedStudentIds([])
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Фамилия</TableHead>
                      <TableHead>Имя</TableHead>
                      <TableHead>Отчество</TableHead>
                      <TableHead>Email / Логин</TableHead>
                      <TableHead>Группа</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Дата регистрации</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAllStudents.map((student) => {
                      const isChecked = selectedStudentIds.includes(student.user_id)
                      const groupNames = getStudentGroupNames(student)
                      const { lastName, firstName, middleName } = splitFullName(
                        student.full_name,
                        student.username
                      )

                      return (
                        <TableRow
                          key={student.user_id}
                          className={isChecked ? "bg-primary/5" : ""}
                        >
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStudentIds((prev) => [...prev, student.user_id])
                                } else {
                                  setSelectedStudentIds((prev) =>
                                    prev.filter((id) => id !== student.user_id)
                                  )
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {lastName}
                          </TableCell>
                          <TableCell className="text-foreground">{firstName}</TableCell>
                          <TableCell className="text-muted-foreground">{middleName}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {student.email || student.username}
                          </TableCell>
                          <TableCell>
                            {groupNames !== "—" ? (
                              <span className="text-sm font-medium text-foreground">
                                {groupNames}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Без группы</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatRole(student.role)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {formatDate(student.created_at)}
                          </TableCell>
                          <TableCell>
                            {student.is_active !== false ? (
                              <span className="text-xs text-green-600 font-medium">Активен</span>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">
                                Заблокирован
                              </span>
                            )}
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
      )}

      {/* ─── MODAL 1: ADD GROUP / CSV / CATALOG ───────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-card border rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Добавить группу / учеников</h3>
                  <p className="text-xs text-muted-foreground">
                    Создайте новую учебную группу или загрузите курсантов
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setModalTab("create_group")}
                className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-2 ${
                  modalTab === "create_group"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderPlus className="h-4 w-4" />
                Новая группа
              </button>
              <button
                onClick={() => setModalTab("upload_csv")}
                className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-2 ${
                  modalTab === "upload_csv"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Импорт через CSV
              </button>
            </div>

            {/* Modal Tab Content */}
            {modalTab === "create_group" ? (
              <form onSubmit={handleCreateGroup} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="modal-group-name">
                    Название группы (смены, потока) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="modal-group-name"
                    name="group_name"
                    required
                    placeholder="Например, Смена 1 или Поток-2026-А"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modal-group-department">Подразделение (необязательно)</Label>
                  <Input
                    id="modal-group-department"
                    name="department"
                    placeholder="Например, Кафедра оперативной диспетчеризации"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !groupName.trim()}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Создание...
                      </>
                    ) : (
                      <>
                        <FolderPlus className="mr-2 h-4 w-4" />
                        Создать группу
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="modal-target-group">Целевая группа</Label>
                  <a
                    href="/api/students/csv-template"
                    download="template_students.csv"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    title="Скачать пример CSV файла"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Шаблон CSV
                  </a>
                </div>

                <Select
                  id="modal-target-group"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={groups.length === 0}
                >
                  {groups.length === 0 ? (
                    <SelectItem value="">Сначала создайте группу</SelectItem>
                  ) : (
                    groups.map((g) => (
                      <SelectItem key={g.group_id} value={g.group_id}>
                        {g.group_name}
                      </SelectItem>
                    ))
                  )}
                </Select>

                <div className="space-y-1.5">
                  <Label>CSV файл (last_name,first_name,middle_name,email)</Label>
                  <Dropzone
                    onFileSelect={setCsvFile}
                    selectedFile={csvFile}
                    accept=".csv,text/csv"
                    title="Перетащите CSV файл сюда (Drag & drop)"
                    description="или нажмите для выбора файла"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    onClick={handleUploadCsv}
                    disabled={isUploading || !csvFile || !selectedGroupId}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Загрузить CSV
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: CATALOG STUDENT PICKER ────────────────────────────────────── */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-card border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Выбор курсантов из каталога
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {catalogTargetGroup
                      ? `Целевая группа: ${catalogTargetGroup.group_name}`
                      : "Выберите группу и отметьте курсантов для привязки"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Target Group & Filter bar */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <Label className="text-xs font-semibold whitespace-nowrap">Группа:</Label>
                  <Select
                    value={catalogTargetGroupId}
                    onChange={(e) => {
                      setCatalogTargetGroupId(e.target.value)
                      setSelectedCatalogUserIds([])
                    }}
                    className="w-full"
                  >
                    {groups.map((g) => (
                      <SelectItem key={g.group_id} value={g.group_id}>
                        {g.group_name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={catalogOnlyWithoutGroup ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCatalogOnlyWithoutGroup((prev) => !prev)}
                    className="text-xs"
                  >
                    Только без группы
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedCatalogUserIds.length === availableCatalogStudents.length) {
                        setSelectedCatalogUserIds([])
                      } else {
                        setSelectedCatalogUserIds(availableCatalogStudents.map((s) => s.user_id))
                      }
                    }}
                    disabled={availableCatalogStudents.length === 0}
                    className="text-xs text-primary"
                  >
                    {selectedCatalogUserIds.length === availableCatalogStudents.length &&
                    availableCatalogStudents.length > 0
                      ? "Снять выбор"
                      : "Выбрать всех доступных"}
                  </Button>
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск курсантов по ФИО, логину или email..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Students Table */}
            <div className="max-h-80 overflow-y-auto overflow-x-auto border rounded-xl w-full">
              {loadingAllStudents && allStudents.length === 0 ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredCatalogStudents.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Курсанты не найдены
                </div>
              ) : (
                <Table className="min-w-[620px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <input
                          type="checkbox"
                          checked={
                            availableCatalogStudents.length > 0 &&
                            selectedCatalogUserIds.length === availableCatalogStudents.length
                          }
                          disabled={availableCatalogStudents.length === 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCatalogUserIds(
                                availableCatalogStudents.map((s) => s.user_id)
                              )
                            } else {
                              setSelectedCatalogUserIds([])
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>ФИО</TableHead>
                      <TableHead>Email / Логин</TableHead>
                      <TableHead>Текущая группа</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCatalogStudents.map((student) => {
                      const alreadyInGroup = isCadetInGroup(student, catalogTargetGroup)
                      const isSelected = selectedCatalogUserIds.includes(student.user_id)
                      const groupNames = getStudentGroupNames(student)
                      const { lastName, firstName, middleName } = splitFullName(
                        student.full_name,
                        student.username
                      )

                      return (
                        <TableRow
                          key={student.user_id}
                          className={
                            alreadyInGroup
                              ? "opacity-60 bg-muted/20"
                              : isSelected
                              ? "bg-primary/5"
                              : ""
                          }
                        >
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={alreadyInGroup || isSelected}
                              disabled={alreadyInGroup}
                              onChange={(e) => {
                                if (alreadyInGroup) return
                                if (e.target.checked) {
                                  setSelectedCatalogUserIds((prev) => [...prev, student.user_id])
                                } else {
                                  setSelectedCatalogUserIds((prev) =>
                                    prev.filter((id) => id !== student.user_id)
                                  )
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-foreground">
                              {lastName} {firstName} {middleName !== "—" ? middleName : ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {student.email || student.username}
                          </TableCell>
                          <TableCell>
                            {alreadyInGroup ? (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium text-xs"
                              >
                                Уже в этой группе
                              </Badge>
                            ) : groupNames !== "—" ? (
                              <Badge variant="outline" className="text-xs">
                                {groupNames}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                Без группы
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {student.is_active !== false ? (
                              <span className="text-xs text-green-600 font-medium">Активен</span>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">
                                Заблокирован
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                Выбрано курсантов:{" "}
                <strong className="text-foreground">{selectedCatalogUserIds.length}</strong>
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCatalogModalOpen(false)}
                  disabled={isLinkingStudents}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={handleLinkCatalogStudents}
                  disabled={
                    isLinkingStudents ||
                    selectedCatalogUserIds.length === 0 ||
                    !catalogTargetGroupId
                  }
                  className="bg-primary text-primary-foreground font-semibold"
                >
                  {isLinkingStudents ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Добавление...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Добавить в группу ({selectedCatalogUserIds.length})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CONFIRM REMOVE STUDENT FROM GROUP ─────────────────────────── */}
      {confirmRemoveStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-card border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-destructive/10 text-destructive rounded-xl">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Исключение из группы</h3>
                <p className="text-xs text-muted-foreground">Требуется подтверждение</p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Вы действительно хотите исключить ученика{" "}
                <strong className="text-foreground">
                  {confirmRemoveStudent.student.full_name || confirmRemoveStudent.student.username}
                </strong>{" "}
                из группы <strong className="text-foreground">{confirmRemoveStudent.groupName}</strong>?
              </p>
              <p className="text-xs text-muted-foreground bg-muted/60 p-3 rounded-lg border">
                Ученик будет исключен из группы, но его учетная запись и история результатов сохранятся.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setConfirmRemoveStudent(null)}
                disabled={isRemovingStudent}
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const { groupId, student } = confirmRemoveStudent
                  await handleRemoveStudent(groupId, student.user_id)
                  setConfirmRemoveStudent(null)
                }}
                disabled={isRemovingStudent}
              >
                {isRemovingStudent ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Исключение...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Исключить из группы
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
