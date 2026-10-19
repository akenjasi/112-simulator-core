"use client"

import {useState} from "react"
import {Dialog} from "@base-ui/react/dialog"
import {X} from "lucide-react"
import {DDSSelfTraining} from "@/components/dispatcher/dds-self-training"

export function TrainingDialog({open, onOpenChange}: {
  open: boolean; onOpenChange: (open: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  return <Dialog.Root open={open} onOpenChange={value => {if (!busy) onOpenChange(value)}} disablePointerDismissal>
    <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" />
      <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(1000px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none max-sm:max-h-[100dvh] max-sm:w-full max-sm:rounded-none">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div><Dialog.Title className="text-xl font-semibold tracking-tight sm:text-2xl">Самостоятельная тренировка</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">Выберите задания и порядок прохождения. Можно начать новый набор независимо от предыдущих занятий.</Dialog.Description></div>
          <Dialog.Close disabled={busy} aria-label="Закрыть выбор заданий" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></Dialog.Close>
        </div>
        <DDSSelfTraining layout="dialog" onBusyChange={setBusy} onCancel={() => onOpenChange(false)} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
