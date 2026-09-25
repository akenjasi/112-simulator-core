import * as React from "react"
import { cn } from "@/lib/utils"

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  disabled?: boolean
}

interface RadioGroupContextValue {
  name?: string
  value?: string
  onChange?: (val: string) => void
  disabled?: boolean
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({})

export function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  children,
  ...props
}: RadioGroupProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "")
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue

  const handleChange = (val: string) => {
    if (!isControlled) {
      setInternalValue(val)
    }
    onValueChange?.(val)
  }

  return (
    <RadioGroupContext.Provider
      value={{ name, value: currentValue, onChange: handleChange, disabled }}
    >
      <div role="radiogroup" className={cn("grid gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string
}

export const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, id, disabled: itemDisabled, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext)
    const isChecked = ctx.value === value
    const isDisabled = itemDisabled || ctx.disabled

    return (
      <input
        ref={ref}
        type="radio"
        role="radio"
        id={id}
        name={ctx.name || props.name}
        value={value}
        checked={isChecked}
        disabled={isDisabled}
        onChange={() => ctx.onChange?.(value)}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer accent-primary",
          className
        )}
        {...props}
      />
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"
