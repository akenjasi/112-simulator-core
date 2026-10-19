"use client"

import { useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { getStoredToken } from "@/lib/auth-session"

interface KnowledgeFile {
  id?: string | number
  file_id?: string
  name?: string
  title?: string
  filename?: string
  size?: number | string
  size_bytes?: number
  url?: string
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б"
  const index = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${Number((bytes / 1024 ** index).toFixed(1))} ${["Б", "КБ", "МБ", "ГБ"][index]}`
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function ProfileMaterials() {
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [downloading, setDownloading] = useState<string | number | null>(null)
  const downloadBusy = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    void fetch("/api/v1/knowledge/files", {headers: authHeaders(), signal: controller.signal, cache: "no-store"})
      .then(async response => {
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error()
        if (!controller.signal.aborted) setFiles(data)
      })
      .catch(() => {if (!controller.signal.aborted) setError(true)})
      .finally(() => {if (!controller.signal.aborted) setLoading(false)})
    return () => controller.abort()
  }, [reload])

  async function download(file: KnowledgeFile, key: string | number) {
    if (!file.url || downloadBusy.current) return
    downloadBusy.current = true
    setDownloading(key)
    try {
      const url = new URL(file.url, window.location.origin)
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) throw new Error()
      const response = await fetch(file.url, {headers: authHeaders()})
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = file.name || file.title || file.filename || "document"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      window.alert("Не удалось скачать документ. Попробуйте ещё раз.")
    } finally {
      downloadBusy.current = false
      setDownloading(null)
    }
  }

  if (loading) return <p role="status" className="py-3 text-sm text-muted-foreground">Загружаем справочные материалы…</p>
  if (error) return <div role="alert" className="space-y-3 text-sm"><p>Не удалось загрузить материалы</p><button type="button" onClick={() => setReload(value => value + 1)} className="min-h-10 font-medium text-primary underline">Повторить попытку</button></div>
  if (files.length === 0) return <div className="py-3"><p className="font-medium">Материалов пока нет</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Преподаватели ещё не загрузили справочные регламенты и нормативные документы.</p></div>
  return <div className="space-y-3">{files.map((file, index) => {
    const name = file.name || file.title || file.filename || "Документ"
    const key = file.id ?? file.file_id ?? index
    return <article key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0"><h3 className="break-words text-sm font-medium">{name}</h3><p className="mt-1 text-xs text-muted-foreground">{typeof file.size === "string" ? file.size : formatBytes(file.size_bytes ?? file.size)}</p></div></div>
      <button type="button" disabled={!file.url || downloading !== null} onClick={() => void download(file, key)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{downloading === key ? "Загрузка…" : "Открыть"}</button>
    </article>
  })}</div>
}
