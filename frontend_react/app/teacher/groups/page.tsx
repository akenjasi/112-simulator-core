"use client"

import React, { useState, useEffect, useCallback } from "react"
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
  KeyRound,
  Printer,
  Copy,
  Check,
  X,
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
  username: string
  email?: string
  full_name?: string | null
  role: string
  groups?: string[]
  is_active?: boolean
  created_at?: string
}

export interface PasswordResetItem {
  user_id: string
  fio: string
  email: string
  new_password: string
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
  if (upper === "CADET") return "Ученик"
  if (upper === "TEACHER") return "Преподаватель"
  if (upper === "ADMIN") return "Администратор"
  return role
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
  const [modalTab, setModalTab] = useState<"create_group" | "upload_csv">("create_group")
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

  // Single student add form in expanded group
  const [singleStudentForm, setSingleStudentForm] = useState<
    Record<string, { last_name: string; first_name: string; middle_name: string; email: string }>
  >({})
  const [isAddingStudent, setIsAddingStudent] = useState<Record<string, boolean>>({})

  // All students tab states
  const [allStudents, setAllStudents] = useState<StudentItem[]>([])
  const [loadingAllStudents, setLoadingAllStudents] = useState<boolean>(false)
  const [studentSearch, setStudentSearch] = useState<string>("")
  const [filterGroupId, setFilterGroupId] = useState<string>("")
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [bulkTargetGroupId, setBulkTargetGroupId] = useState<string>("")
  const [isBulkAdding, setIsBulkAdding] = useState<boolean>(false)

  // Password reset confirmation modal states
  const [confirmResetStudent, setConfirmResetStudent] = useState<StudentItem | null>(null)
  const [confirmResetGroup, setConfirmResetGroup] = useState<StudentGroup | null>(null)

  // Password reset modal states (Single student)
  const [resetModalData, setResetModalData] = useState<{
    isOpen: boolean
    fio: string
    email: string
    newPassword: string
  }>({
    isOpen: false,
    fio: "",
    email: "",
    newPassword: "",
  })
  const [isResettingSingle, setIsResettingSingle] = useState<Record<string, boolean>>({})
  const [copiedPin, setCopiedPin] = useState(false)

  // Group batch reset / print modal states
  const [groupPrintModalData, setGroupPrintModalData] = useState<{
    isOpen: boolean
    groupName: string
    list: PasswordResetItem[]
  }>({
    isOpen: false,
    groupName: "",
    list: [],
  })
  const [isResettingGroup, setIsResettingGroup] = useState<Record<string, boolean>>({})

  // Fetch groups from backend
  const loadGroups = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/v1/groups")
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
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить список групп")
    } finally {
      setIsLoading(false)
    }
  }, [bulkTargetGroupId])

  // Fetch students for a specific group
  const loadGroupStudents = useCallback(async (groupId: string) => {
    try {
      setLoadingGroupStudents((prev) => ({ ...prev, [groupId]: true }))
      const res = await fetch(`/api/v1/groups/${groupId}/students`)
      if (res.ok) {
        const data = await res.json()
        setGroupStudents((prev) => ({ ...prev, [groupId]: Array.isArray(data) ? data : [] }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingGroupStudents((prev) => ({ ...prev, [groupId]: false }))
    }
  }, [])

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

  // Fetch all students
  const loadAllStudents = useCallback(async () => {
    try {
      setLoadingAllStudents(true)
      const res = await fetch("/api/v1/students")
      if (res.ok) {
        const data = await res.json()
        setAllStudents(Array.isArray(data) ? data : [])
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoadingAllStudents(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  useEffect(() => {
    if (activeTab === "all_students") {
      loadAllStudents()
    }
  }, [activeTab, loadAllStudents])

  // Helper to get group names for a student
  const getStudentGroupNames = (student: StudentItem): string => {
    if (student.groups && student.groups.length > 0) {
      return student.groups.join(", ")
    }
    const matched = groups
      .filter((g) => g.cadet_ids && g.cadet_ids.includes(student.user_id))
      .map((g) => g.group_name)
    return matched.length > 0 ? matched.join(", ") : "—"
  }

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
        headers: { "Content-Type": "application/json" },
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
    } catch (err: any) {
      setError(err.message || "Ошибка импорта CSV")
    } finally {
      setIsUploading(false)
    }
  }

  // Handle single student add inside group accordion
  const handleAddSingleStudent = async (groupId: string) => {
    const form = singleStudentForm[groupId] || {
      last_name: "",
      first_name: "",
      middle_name: "",
      email: "",
    }
    if (!form.email.trim()) {
      setError("Укажите email ученика")
      return
    }

    try {
      setIsAddingStudent((prev) => ({ ...prev, [groupId]: true }))
      setError(null)
      setSuccessMessage(null)

      const res = await fetch(`/api/v1/groups/${groupId}/students/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          last_name: form.last_name.trim(),
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim() || undefined,
          email: form.email.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Не удалось добавить ученика (${res.status})`)
      }

      setSuccessMessage(`Ученик ${form.email} успешно добавлен в группу!`)
      setSingleStudentForm((prev) => ({
        ...prev,
        [groupId]: { last_name: "", first_name: "", middle_name: "", email: "" },
      }))
      await loadGroupStudents(groupId)
      await loadGroups()
    } catch (err: any) {
      setError(err.message || "Ошибка при добавлении ученика")
    } finally {
      setIsAddingStudent((prev) => ({ ...prev, [groupId]: false }))
    }
  }

  // Remove student from group
  const handleRemoveStudent = async (groupId: string, userId: string) => {
    try {
      setError(null)
      const res = await fetch(`/api/v1/groups/${groupId}/students/${userId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || "Ошибка при удалении ученика из группы")
      }
      setSuccessMessage("Ученик успешно удален из группы")
      await loadGroupStudents(groupId)
      await loadGroups()
    } catch (err: any) {
      setError(err.message || "Ошибка при удалении ученика")
    }
  }

  // Reset single student password
  const handleResetUserPassword = async (student: StudentItem) => {
    try {
      setIsResettingSingle((prev) => ({ ...prev, [student.user_id]: true }))
      setError(null)
      const res = await fetch(`/api/users/${student.user_id}/reset-password`, {
        method: "POST",
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || "Не удалось сбросить пароль")
      }
      const data = await res.json()
      setCopiedPin(false)
      setResetModalData({
        isOpen: true,
        fio: student.full_name || student.username,
        email: student.email || student.username,
        newPassword: data.new_password,
      })
    } catch (err: any) {
      setError(err.message || "Ошибка сброса пароля")
    } finally {
      setIsResettingSingle((prev) => ({ ...prev, [student.user_id]: false }))
    }
  }

  // Reset all passwords for a group
  const handleResetGroupPasswords = async (group: StudentGroup) => {
    try {
      setIsResettingGroup((prev) => ({ ...prev, [group.group_id]: true }))
      setError(null)
      const res = await fetch(`/api/groups/${group.group_id}/reset-passwords`, {
        method: "POST",
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || "Не удалось сбросить пароли группы")
      }
      const data = await res.json()
      const list: PasswordResetItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.list)
        ? data.list
        : []
      setGroupPrintModalData({
        isOpen: true,
        groupName: group.group_name,
        list,
      })
    } catch (err: any) {
      setError(err.message || "Ошибка при сбросе паролей группы")
    } finally {
      setIsResettingGroup((prev) => ({ ...prev, [group.group_id]: false }))
    }
  }

  // Print generated accesses
  const handlePrintAccesses = () => {
    const { groupName, list } = groupPrintModalData
    const printWin = window.open("", "_blank")
    if (!printWin) {
      alert("Разрешите всплывающие окна для печати")
      return
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Доступы группы - ${groupName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #111; }
            h2 { margin: 0 0 4px 0; font-size: 20px; }
            .meta { font-size: 13px; color: #555; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 14px; }
            th { background-color: #f3f4f6; font-weight: 600; }
            .pwd { font-family: monospace; font-size: 16px; font-weight: bold; letter-spacing: 2px; }
            @media print {
              body { padding: 0; }
              @page { margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <h2>Список доступов: ${groupName}</h2>
          <div class="meta">Симулятор 112 • Сформировано: ${new Date().toLocaleString("ru-RU")}</div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">№</th>
                <th>ФИО</th>
                <th>Email / Логин</th>
                <th style="width: 120px;">Новый пароль</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${item.fio || "—"}</td>
                  <td>${item.email}</td>
                  <td class="pwd">${item.new_password}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `
    printWin.document.open()
    printWin.document.write(htmlContent)
    printWin.document.close()
  }

  // Bulk add selected students to group
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
      for (const studentId of selectedStudentIds) {
        await fetch(`/api/v1/groups/${bulkTargetGroupId}/students/single`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: studentId }),
        })
      }
      setSuccessMessage(`Успешно добавлено учеников: ${selectedStudentIds.length}`)
      setSelectedStudentIds([])
      await loadGroups()
      if (expandedGroupIds[bulkTargetGroupId]) {
        await loadGroupStudents(bulkTargetGroupId)
      }
    } catch (err: any) {
      setError(err.message || "Ошибка при массовом добавлении учеников")
    } finally {
      setIsBulkAdding(false)
    }
  }

  const filteredAllStudents = allStudents.filter((s) => {
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
                Формирование учебных смен и потоков, назначение учеников, генерация и печать паролей доступа
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
              onClick={() => setActiveTab("all_students")}
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
                Всего учебных групп в системе: {groups.length}. Нажмите на строку группы, чтобы раскрыть состав и управлять паролями.
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
                Нажмите «Добавить группу», чтобы создать первую смену или импортировать учеников из CSV.
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
                const form = singleStudentForm[group.group_id] || {
                  last_name: "",
                  first_name: "",
                  middle_name: "",
                  email: "",
                }
                const isAdding = isAddingStudent[group.group_id]
                const isBatchResetting = isResettingGroup[group.group_id]

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
                          {studentCount} {studentCount === 1 ? "ученик" : studentCount >= 2 && studentCount <= 4 ? "ученика" : "учеников"}
                        </span>
                      </div>
                    </div>

                    {/* Group Accordion Content */}
                    {isExpanded && (
                      <div className="p-4 border-t bg-muted/10 space-y-4">
                        {/* Group Actions Toolbar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-background border rounded-lg">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Управление доступом группы
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Сгенерируйте новые 5-значные пароли для всех учеников этой смены
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBatchResetting || studentCount === 0}
                            onClick={() => setConfirmResetGroup(group)}
                            className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/40"
                          >
                            {isBatchResetting ? (
                              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4 mr-1.5" />
                            )}
                            Сбросить пароли всей группе
                          </Button>
                        </div>

                        {/* Inline Form: Quick add student */}
                        <div className="p-3 border rounded-lg bg-background space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Быстрое добавление ученика в группу
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                            <Input
                              placeholder="Фамилия"
                              value={form.last_name}
                              onChange={(e) =>
                                setSingleStudentForm((prev) => ({
                                  ...prev,
                                  [group.group_id]: { ...form, last_name: e.target.value },
                                }))
                              }
                            />
                            <Input
                              placeholder="Имя"
                              value={form.first_name}
                              onChange={(e) =>
                                setSingleStudentForm((prev) => ({
                                  ...prev,
                                  [group.group_id]: { ...form, first_name: e.target.value },
                                }))
                              }
                            />
                            <Input
                              placeholder="Отчество (необяз.)"
                              value={form.middle_name}
                              onChange={(e) =>
                                setSingleStudentForm((prev) => ({
                                  ...prev,
                                  [group.group_id]: { ...form, middle_name: e.target.value },
                                }))
                              }
                            />
                            <Input
                              placeholder="Email / Логин *"
                              type="email"
                              value={form.email}
                              onChange={(e) =>
                                setSingleStudentForm((prev) => ({
                                  ...prev,
                                  [group.group_id]: { ...form, email: e.target.value },
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              onClick={() => handleAddSingleStudent(group.group_id)}
                              disabled={isAdding || !form.email.trim()}
                            >
                              {isAdding ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="h-4 w-4 mr-1" />
                                  Добавить
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Students Table */}
                        {isLoadingStudents ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : students.length === 0 ? (
                          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-background">
                            В этой группе пока нет учеников. Загрузите CSV или добавьте ученика через форму выше.
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
                                  const isResetting = isResettingSingle[student.user_id]
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
                                        <div className="flex items-center justify-end gap-1.5">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isResetting}
                                            onClick={() => setConfirmResetStudent(student)}
                                            className="text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                            title="Сбросить пароль"
                                          >
                                            {isResetting ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                            ) : (
                                              <KeyRound className="h-3.5 w-3.5 mr-1" />
                                            )}
                                            Сбросить пароль
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:bg-destructive/10"
                                            onClick={() =>
                                              handleRemoveStudent(group.group_id, student.user_id)
                                            }
                                            title="Удалить из группы"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
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
                Главная таблица всех учеников системы с указанием учебных смен и управлением паролями
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

              {/* Bulk Action: Add to group */}
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
                <Table className="min-w-[650px]">
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
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAllStudents.map((student) => {
                      const isChecked = selectedStudentIds.includes(student.user_id)
                      const isResetting = isResettingSingle[student.user_id]
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
                            <span className="text-sm font-medium text-foreground">
                              {groupNames}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatRole(student.role)}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-green-600 font-medium">Активен</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isResetting}
                              onClick={() => setConfirmResetStudent(student)}
                              className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/40"
                              title="Сбросить пароль"
                            >
                              {isResetting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <KeyRound className="h-3.5 w-3.5 mr-1" />
                              )}
                              Сбросить пароль
                            </Button>
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

      {/* ─── MODAL 1: ADD GROUP / UPLOAD CSV ───────────────────────────────────── */}
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
                    Создайте новую смену или импортируйте учеников из CSV
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

      {/* ─── MODAL: CONFIRM SINGLE PASSWORD RESET ─────────────────────────────── */}
      {confirmResetStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-card border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Сброс пароля</h3>
                <p className="text-xs text-muted-foreground">Требуется подтверждение действия</p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Вы действительно хотите сбросить пароль для ученика{" "}
                <strong className="text-foreground">
                  {confirmResetStudent.full_name || confirmResetStudent.username}
                </strong>{" "}
                ({confirmResetStudent.email || confirmResetStudent.username})?
              </p>
              <p className="text-xs text-muted-foreground/80">
                Будет сгенерирован новый 5-значный пароль доступа. Старый пароль станет недействительным.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setConfirmResetStudent(null)}
                disabled={isResettingSingle[confirmResetStudent.user_id]}
              >
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  const s = confirmResetStudent
                  setConfirmResetStudent(null)
                  await handleResetUserPassword(s)
                }}
                disabled={isResettingSingle[confirmResetStudent.user_id]}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isResettingSingle[confirmResetStudent.user_id] ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Сброс...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-1.5" />
                    Сбросить пароль
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CONFIRM GROUP PASSWORDS RESET ──────────────────────────────── */}
      {confirmResetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-card border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                <Printer className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Сбросить пароли группе</h3>
                <p className="text-xs text-muted-foreground">Массовый сброс паролей</p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Вы действительно хотите сбросить пароли всем ученикам группы{" "}
                <strong className="text-foreground">{confirmResetGroup.group_name}</strong>?
              </p>
              <p className="text-xs text-muted-foreground/80">
                Будут сгенерированы новые 5-значные коды доступа для всех учеников с возможностью распечатать ведомость.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setConfirmResetGroup(null)}
                disabled={isResettingGroup[confirmResetGroup.group_id]}
              >
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  const g = confirmResetGroup
                  setConfirmResetGroup(null)
                  await handleResetGroupPasswords(g)
                }}
                disabled={isResettingGroup[confirmResetGroup.group_id]}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isResettingGroup[confirmResetGroup.group_id] ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Сброс...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-1.5" />
                    Сбросить пароли
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: SINGLE PASSWORD RESET ────────────────────────────────────── */}
      {resetModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-card border rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center dark:bg-amber-950/60 dark:text-amber-400">
              <KeyRound className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-foreground">Пароль успешно сброшен</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Для ученика <span className="font-semibold text-foreground">{resetModalData.fio}</span> (
                {resetModalData.email}) сгенерирован новый код доступа:
              </p>
            </div>

            {/* Big PIN Code Box */}
            <div className="flex items-center justify-center py-4 bg-muted/30 border rounded-xl">
              <span className="font-mono text-4xl font-extrabold tracking-widest text-primary">
                {resetModalData.newPassword}
              </span>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resetModalData.newPassword)
                  setCopiedPin(true)
                  setTimeout(() => setCopiedPin(false), 2000)
                }}
              >
                {copiedPin ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5 text-green-600" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    Скопировать пароль
                  </>
                )}
              </Button>
              <Button
                onClick={() =>
                  setResetModalData({
                    isOpen: false,
                    fio: "",
                    email: "",
                    newPassword: "",
                  })
                }
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: GROUP PASSWORDS PRINT ACCESSES ───────────────────────────── */}
      {groupPrintModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-card border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Доступы группы: {groupPrintModalData.groupName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Сгенерированы новые пароли для всех {groupPrintModalData.list.length} учеников. Распечатайте для раздачи.
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setGroupPrintModalData({
                    isOpen: false,
                    groupName: "",
                    list: [],
                  })
                }
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Table */}
            <div className="max-h-96 overflow-y-auto overflow-x-auto border rounded-lg w-full">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">№</TableHead>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Email / Логин</TableHead>
                    <TableHead className="text-right">Новый пароль</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupPrintModalData.list.map((item, idx) => (
                    <TableRow key={item.user_id || idx}>
                      <TableCell className="text-center font-mono text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {item.fio || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {item.email}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-base font-bold tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-md">
                          {item.new_password}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() =>
                  setGroupPrintModalData({
                    isOpen: false,
                    groupName: "",
                    list: [],
                  })
                }
              >
                Закрыть
              </Button>
              <Button
                onClick={handlePrintAccesses}
                className="bg-primary text-primary-foreground shadow"
              >
                <Printer className="h-4 w-4 mr-2" />
                Распечатать доступы
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
