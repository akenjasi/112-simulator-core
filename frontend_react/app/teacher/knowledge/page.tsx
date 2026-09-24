"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dropzone } from "@/components/ui/dropzone"
import {
  BookOpen,
  FileText,
  FileCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Download,
  Trash2,
  FileCode2,
  HardDrive,
} from "lucide-react"

export interface KnowledgeFile {
  id?: string | number
  file_id?: string
  name?: string
  title?: string
  filename?: string
  size?: number
  size_bytes?: number
  uploaded_at?: string
  created_at?: string
  content_type?: string
  url?: string
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "0 Б"
  if (bytes === 0) return "0 Б"
  const k = 1024
  const sizes = ["Б", "КБ", "МБ", "ГБ"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
  return `${formatted} ${sizes[i] || "Б"}`
}

export function formatDate(dateString?: string): string {
  if (!dateString) return "—"
  try {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return dateString
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
  }
}

export function getFileFormat(filename: string): "PDF" | "DOCX" | "OTHER" {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "PDF"
  if (lower.endsWith(".docx")) return "DOCX"
  return "OTHER"
}

export function isValidKnowledgeFormat(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith(".pdf") || lower.endsWith(".docx")
}

export default function KnowledgePage() {
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Staged file for dropzone upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // UI display filters & view modes
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [filterFormat, setFilterFormat] = useState<"ALL" | "PDF" | "DOCX">("ALL")

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch documents from API
  const loadFiles = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/v1/knowledge/files")
      if (!res.ok) {
        throw new Error(`Ошибка загрузки списка файлов (${res.status})`)
      }
      const data = await res.json()
      const list: KnowledgeFile[] = Array.isArray(data) ? data : []
      setFiles(list)
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить базу знаний")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  // Direct upload handler using FormData
  const uploadFile = async (fileToUpload: File) => {
    if (!isValidKnowledgeFormat(fileToUpload.name)) {
      setError("Поддерживаются только файлы формата PDF и DOCX")
      return
    }

    try {
      setIsUploading(true)
      setError(null)
      setSuccessMessage(null)

      const formData = new FormData()
      formData.append("file", fileToUpload)

      const res = await fetch("/api/v1/knowledge/files", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Ошибка загрузки файла (${res.status})`)
      }

      setSuccessMessage(`Документ "${fileToUpload.name}" успешно загружен!`)
      setSelectedFile(null)
      await loadFiles()
    } catch (err: any) {
      setError(err.message || "Ошибка при отправке файла на сервер")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  // Trigger system file picker or upload staged file
  const handleUploadButtonClick = () => {
    if (selectedFile) {
      uploadFile(selectedFile)
    } else {
      fileInputRef.current?.click()
    }
  }

  // Handle native file input selection
  const handleNativeFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await uploadFile(file)
    }
  }

  // Handle Dropzone selection
  const handleDropzoneSelect = (file: File | null) => {
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!isValidKnowledgeFormat(file.name)) {
      setError("Поддерживаются только файлы формата PDF и DOCX")
      setSelectedFile(null)
      return
    }
    setError(null)
    setSelectedFile(file)
  }

  // Handle file deletion
  const handleDeleteFile = async (fileId: string | number) => {
    try {
      setError(null)
      const res = await fetch(`/api/v1/knowledge/files/${fileId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        throw new Error(`Ошибка при удалении файла (${res.status})`)
      }
      setSuccessMessage("Документ успешно удален")
      setFiles((prev) => prev.filter((f) => (f.id ?? f.file_id) !== fileId))
    } catch (err: any) {
      setError(err.message || "Не удалось удалить файл")
    }
  }

  // Filtered files
  const filteredFiles = files.filter((f) => {
    const name = f.name || f.title || f.filename || ""
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase().trim())
    const format = getFileFormat(name)
    const matchesFormat =
      filterFormat === "ALL" ||
      (filterFormat === "PDF" && format === "PDF") ||
      (filterFormat === "DOCX" && format === "DOCX")
    return matchesSearch && matchesFormat
  })

  // Statistics
  const totalFiles = files.length
  const pdfCount = files.filter((f) => getFileFormat(f.name || f.title || f.filename || "") === "PDF").length
  const docxCount = files.filter((f) => getFileFormat(f.name || f.title || f.filename || "") === "DOCX").length
  const totalSizeBytes = files.reduce((acc, f) => acc + (f.size ?? f.size_bytes ?? 0), 0)

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-8">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-upload-input"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleNativeFileInputChange}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
            <BookOpen className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              База знаний
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Управление регламентами, приказами и нормативными документами (PDF / DOCX) для курсантов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadFiles}
            disabled={isLoading}
            title="Обновить список документов"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="ml-1.5 hidden sm:inline">Обновить</span>
          </Button>

          <Button
            onClick={handleUploadButtonClick}
            disabled={isUploading}
            className="shadow-sm"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Загрузка...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Загрузить документ
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notification Alerts */}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Всего документов</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{totalFiles}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Регламенты PDF</p>
          <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{pdfCount}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Инструкции DOCX</p>
          <p className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">{docxCount}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Общий объем</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{formatBytes(totalSizeBytes)}</p>
        </Card>
      </div>

      {/* Upload Zone Card */}
      <Card className="shadow-sm border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Быстрая загрузка регламентов
          </CardTitle>
          <CardDescription>
            Перетащите файлы нормативных документов или выберите с диска. Поддерживаются только форматы <strong>PDF</strong> и <strong>DOCX</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Dropzone
            onFileSelect={handleDropzoneSelect}
            selectedFile={selectedFile}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            title="Перетащите файл регламента сюда (PDF или DOCX)"
            description="или нажмите для выбора файла на компьютере"
          />

          {selectedFile && (
            <div className="flex items-center justify-end pt-1">
              <Button
                type="button"
                onClick={() => uploadFile(selectedFile)}
                disabled={isUploading}
                size="sm"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Отправка на сервер...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    Отправить выбранный файл
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Manager Section */}
      <Card className="shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Файловый менеджер регламентов</CardTitle>
              <CardDescription>
                Список учебных документов, доступных курсантам во время тренажера и экзамена
              </CardDescription>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start sm:self-auto">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("list")}
                title="Отображать списком (таблица)"
                aria-label="Вид списком"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon-xs"
                onClick={() => setViewMode("grid")}
                title="Отображать карточками (сетка)"
                aria-label="Вид сеткой"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Поиск по названию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Button
                variant={filterFormat === "ALL" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterFormat("ALL")}
              >
                Все ({files.length})
              </Button>
              <Button
                variant={filterFormat === "PDF" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterFormat("PDF")}
              >
                PDF ({pdfCount})
              </Button>
              <Button
                variant={filterFormat === "DOCX" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterFormat("DOCX")}
              >
                DOCX ({docxCount})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Загрузка документов базы знаний...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
              <HardDrive className="h-10 w-10 text-muted-foreground/60 mb-2" />
              <h3 className="font-semibold text-lg">Документы пока не загружены</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Загрузите первый нормативный документ или приказ (PDF/DOCX), нажав кнопку "Загрузить документ" выше.
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              По вашему запросу документы не найдены.
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="knowledge-grid">
              {filteredFiles.map((file, idx) => {
                const fileId = file.id ?? file.file_id ?? `file-${idx}`
                const name = file.name || file.title || file.filename || "Документ"
                const size = file.size ?? file.size_bytes ?? 0
                const dateStr = file.uploaded_at || file.created_at || ""
                const format = getFileFormat(name)

                return (
                  <Card key={fileId} className="flex flex-col justify-between p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted shrink-0">
                        {format === "PDF" ? (
                          <FileText className="h-6 w-6 text-red-500" />
                        ) : (
                          <FileCode2 className="h-6 w-6 text-blue-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-foreground truncate" title={name}>
                            {name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={format === "PDF" ? "destructive" : "secondary"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {format}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Загружен: {formatDate(dateStr)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t mt-4 pt-3">
                      {file.url ? (
                        <a
                          href={file.url}
                          download={name}
                          className="inline-flex items-center text-xs text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Скачать
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Локальный файл</span>
                      )}

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDeleteFile(fileId)}
                        title="Удалить документ"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* List / Table View */
            <div className="border rounded-md" data-testid="knowledge-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название документа</TableHead>
                    <TableHead>Формат</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Дата загрузки</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file, idx) => {
                    const fileId = file.id ?? file.file_id ?? `file-${idx}`
                    const name = file.name || file.title || file.filename || "Документ"
                    const size = file.size ?? file.size_bytes ?? 0
                    const dateStr = file.uploaded_at || file.created_at || ""
                    const format = getFileFormat(name)

                    return (
                      <TableRow key={fileId}>
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {format === "PDF" ? (
                              <FileText className="h-4 w-4 text-red-500 shrink-0" />
                            ) : (
                              <FileCode2 className="h-4 w-4 text-blue-500 shrink-0" />
                            )}
                            <span className="truncate max-w-sm sm:max-w-md">{name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={format === "PDF" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {format}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatBytes(size)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(dateStr)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {file.url && (
                              <a
                                href={file.url}
                                download={name}
                                title="Скачать файл"
                                className="inline-flex items-center justify-center size-6 rounded-md hover:bg-muted text-foreground transition-colors"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDeleteFile(fileId)}
                              title="Удалить документ"
                              className="text-muted-foreground hover:text-destructive"
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
        </CardContent>
      </Card>
    </div>
  )
}
