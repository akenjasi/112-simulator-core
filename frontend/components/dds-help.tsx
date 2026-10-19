"use client"

import {useId, useState} from "react"
import {Tooltip} from "@base-ui/react/tooltip"
import {CircleHelp} from "lucide-react"
import {DDS_HELP, type DDSHelpTopic} from "@/lib/dds-interface-help"

/** A separate trigger: asking for help must never click a working control. */
export function DDSHelp({topic, className = ""}: {topic: DDSHelpTopic; className?: string}) {
  const [open, setOpen] = useState(false)
  const descriptionId = useId()
  const help = DDS_HELP[topic]
  return <Tooltip.Provider delay={200}>
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger type="button" closeOnClick={false}
        aria-label={`Справка: ${help.title}`} aria-expanded={open}
        aria-describedby={open ? descriptionId : undefined}
        onClick={event => {event.stopPropagation(); event.currentTarget.focus(); setOpen(true)}}
        onKeyDown={event => {if (event.key === "Escape") {event.stopPropagation(); setOpen(false)}}}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-current opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${className}`}>
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} className="z-[1200]">
          <Tooltip.Popup id={descriptionId} role="tooltip" className="max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 text-sm leading-relaxed text-popover-foreground shadow-lg">
            <p className="mb-1 font-semibold">{help.title}</p><p>{help.text}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
}
