"use client"

import * as React from "react"
import { UploadCloud, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

export interface DropzoneProps {
  onFileSelect: (file: File | null) => void
  selectedFile?: File | null
  accept?: string
  disabled?: boolean
  className?: string
  title?: string
  description?: string
}

export function Dropzone({
  onFileSelect,
  selectedFile,
  accept = ".csv,text/csv",
  disabled = false,
  className,
  title = "Перетащите CSV файл сюда (Drag & drop)",
  description = "или нажмите для выбора файла на компьютере",
}: DropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      if (accept) {
        const acceptedItems = accept.split(",").map((s) => s.trim().toLowerCase())
        const fileExt = "." + (file.name.split(".").pop() || "").toLowerCase()
        const isMatch = acceptedItems.some((pat) => {
          if (pat.startsWith(".")) {
            return fileExt === pat
          }
          if (pat.endsWith("/*")) {
            return file.type.toLowerCase().startsWith(pat.slice(0, -2))
          }
          return file.type.toLowerCase() === pat
        })
        if (!isMatch) {
          alert(`Недопустимый формат файла. Допустимые форматы: ${accept}`)
          return
        }
      }
      onFileSelect(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onFileSelect(files[0])
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (inputRef.current) {
      inputRef.current.value = ""
    }
    onFileSelect(null)
  }

  return (
    <div
      data-testid="dropzone"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "relative flex min-h-[140px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
        isDragging
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        data-testid="dropzone-file-input"
        accept={accept}
        disabled={disabled}
        onChange={handleFileInput}
        className="hidden"
      />

      {selectedFile ? (
        <div className="flex items-center gap-3 p-3 bg-background rounded-md border w-full max-w-md justify-between">
          <div className="flex items-center gap-3 overflow-hidden text-left">
            <FileText className="h-6 w-6 text-primary shrink-0" />
            <div className="truncate">
              <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleRemove}
            title="Удалить файл"
            aria-label="Удалить файл"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full bg-muted p-3">
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-sm">
            <span className="font-semibold text-foreground">{title}</span>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
      )}
    </div>
  )
}
