import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => {
    return (
      <div className={cn("relative w-full", containerClassName)}>
        <select
          ref={ref}
          role="combobox"
          className={cn(
            "flex h-9 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50 pr-8",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 opacity-50" />
      </div>
    )
  }
)
Select.displayName = "Select"

export function SelectItem({
  value,
  children,
  className,
  ...props
}: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return (
    <option value={value} className={cn("py-1", className)} {...props}>
      {children}
    </option>
  )
}

export function SelectTrigger({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="combobox"
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </div>
  )
}

export function SelectValue({
  placeholder,
  children,
}: {
  placeholder?: string
  children?: React.ReactNode
}) {
  return <span>{children || placeholder}</span>
}

export function SelectContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-md border bg-popover p-1 shadow-md", className)} {...props}>
      {children}
    </div>
  )
}
