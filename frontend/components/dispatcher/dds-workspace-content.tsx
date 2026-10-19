"use client"

import type {ReactNode} from "react"
import type {DispatcherData} from "@/lib/dispatcher-data"
import {TopBar} from "./top-bar"
import {CallerPanel} from "./caller-panel"
import {IncidentPanel} from "./incident-panel"

/** The same layout for a persisted lesson and the read-only interface guide. */
export function DDSWorkspaceContent({card, phone, services, guide = false}: {
  card: DispatcherData; phone: ReactNode; services: ReactNode; guide?: boolean
}) {
  return <>
    <TopBar data={card} />
    <div className={`flex flex-1 min-h-0 gap-3 px-2 py-1 ${guide ? "flex-col overflow-y-auto md:flex-row md:overflow-hidden" : "overflow-hidden"}`} data-testid="dds-reference-columns">
      <CallerPanel data={card} />
      <div className={`flex flex-1 min-w-0 flex-col gap-2 overflow-y-auto pr-2 pb-2 ${guide ? "min-h-[28rem] md:min-h-0" : "min-h-0"}`}>
        <IncidentPanel data={card} />
        {phone}
      </div>
    </div>
    <div className="shrink-0 z-50 w-full">{services}</div>
  </>
}
