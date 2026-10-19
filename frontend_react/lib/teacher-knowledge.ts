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
