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
} from "lucide-react"

export type ProfileType = "OPERATOR_112" | "DISPATCHER_DDS"

export interface StudentGroup {
  group_id: string
  group_name: string
  profile: ProfileType
  department?: string | null
  cadet_ids: string[]
  created_at?: string
  is_active?: boolean
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Creation form states
  const [groupName, setGroupName] = useState("")
  const [profile, setProfile] = useState<ProfileType>("OPERATOR_112")
  const [department, setDepartment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV upload states
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

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
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить список групп")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

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
        profile,
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
      setError("Выберите целевую группу для импорта курсантов")
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

      setSuccessMessage("Курсанты успешно импортированы из CSV!")
      setCsvFile(null)
      await loadGroups()
    } catch (err: any) {
      setError(err.message || "Ошибка импорта CSV")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Users className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Управление группами
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Рабочее место преподавателя: формирование учебных групп, выбор профиля подготовки и пакетный импорт курсантов
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Forms Grid: Create Group & Upload CSV */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Create Group */}
        <Card className="flex flex-col justify-between shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">Создание группы</CardTitle>
            </div>
            <CardDescription>
              Введите параметры новой учебной группы и выберите специализацию.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="group-name">
                  Название группы <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="group-name"
                  name="group_name"
                  required
                  placeholder="Например, ОП-2026-1"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="group-profile">
                  Профиль <span className="text-destructive">*</span>
                </Label>
                <Select
                  id="group-profile"
                  name="profile"
                  aria-label="Профиль"
                  required
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as ProfileType)}
                >
                  <SelectItem value="OPERATOR_112">OPERATOR_112 (Оператор 112)</SelectItem>
                  <SelectItem value="DISPATCHER_DDS">DISPATCHER_DDS (Диспетчер ДДС)</SelectItem>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="group-department">Подразделение (необязательно)</Label>
                <Input
                  id="group-department"
                  name="department"
                  placeholder="Например, Отделение связи и телекоммуникаций"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Создание...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Создать группу
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Card 2: Upload CSV */}
        <Card className="flex flex-col justify-between shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">Добавление курсантов</CardTitle>
            </div>
            <CardDescription>
              Загрузите список курсантов через CSV файл в выбранную учебную группу.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="target-group-select">Целевая группа</Label>
              <Select
                id="target-group-select"
                aria-label="Целевая группа"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                disabled={groups.length === 0}
              >
                {groups.length === 0 ? (
                  <SelectItem value="">Сначала создайте группу</SelectItem>
                ) : (
                  groups.map((g) => (
                    <SelectItem key={g.group_id} value={g.group_id}>
                      {g.group_name} ({g.profile === "OPERATOR_112" ? "Оператор 112" : "Диспетчер ДДС"})
                    </SelectItem>
                  ))
                )}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>CSV файл со списком курсантов</Label>
              <Dropzone
                onFileSelect={setCsvFile}
                selectedFile={csvFile}
                accept=".csv,text/csv"
                title="Перетащите CSV файл сюда (Drag & drop)"
                description="или нажмите для выбора файла (first_name, last_name, email)"
              />
            </div>

            <Button
              type="button"
              onClick={handleUploadCsv}
              disabled={isUploading || !csvFile || !selectedGroupId}
              className="w-full mt-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Загрузка файла...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Загрузить CSV
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Card 3: Groups List Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Список групп</CardTitle>
            <CardDescription>Всего учебных групп в системе: {groups.length}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadGroups}
            disabled={isLoading}
            title="Обновить список"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="ml-1.5 hidden sm:inline">Обновить</span>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Загрузка групп...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
              <Users className="h-10 w-10 text-muted-foreground/60 mb-2" />
              <h3 className="font-semibold text-lg">Группы пока не созданы</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Создайте вашу первую группу с профилем "Оператор 112" или "Диспетчер ДДС" в форме выше.
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название группы</TableHead>
                    <TableHead>Профиль</TableHead>
                    <TableHead>Подразделение</TableHead>
                    <TableHead className="text-center">Кол-во курсантов</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => {
                    const studentCount = group.cadet_ids?.length || 0
                    const isSelected = group.group_id === selectedGroupId

                    return (
                      <TableRow
                        key={group.group_id}
                        className={isSelected ? "bg-primary/5 font-medium" : ""}
                      >
                        <TableCell className="font-semibold text-foreground">
                          {group.group_name}
                        </TableCell>
                        <TableCell>
                          {group.profile === "OPERATOR_112" ? (
                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                              Оператор 112
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-amber-600/90 text-white hover:bg-amber-700">
                              Диспетчер ДДС
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {group.department || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground">
                            {studentCount} {studentCount === 1 ? "курсант" : "курсантов"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedGroupId(group.group_id)}
                          >
                            {isSelected ? "Выбрана" : "Выбрать для импорта"}
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
    </div>
  )
}
