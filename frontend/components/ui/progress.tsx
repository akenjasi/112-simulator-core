import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
}

export function Progress({ className, value = 0, max = 100, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-secondary/50", className)}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all duration-500 ease-in-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
