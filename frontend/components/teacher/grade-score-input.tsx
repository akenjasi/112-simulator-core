"use client"

import React from "react"
import { Input } from "@/components/ui/input"

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
}

const isDecimalScore = (value: string) => /^(?:\d+(?:\.\d*)?|\.\d*)?$/.test(value)

/** Numeric grades use plain unsigned decimals, never scientific notation. */
export function GradeScoreInput({ value, onValueChange, onKeyDown, onPaste, ...props }: Props) {
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min="0"
      max="100"
      step="any"
      value={value}
      onKeyDown={(event) => {
        if (["e", "E", "+", "-"].includes(event.key) && !event.ctrlKey && !event.metaKey) {
          event.preventDefault()
        }
        onKeyDown?.(event)
      }}
      onPaste={(event) => {
        onPaste?.(event)
        if (event.defaultPrevented) return
        const text = event.clipboardData.getData("text").trim()
        if (!isDecimalScore(text)) event.preventDefault()
      }}
      onChange={(event) => {
        if (isDecimalScore(event.target.value)) onValueChange(event.target.value)
      }}
    />
  )
}
