import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-control border border-transparent bg-fill px-3 py-2 text-[15px] text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-label-tertiary focus-visible:outline-none focus-visible:bg-surface focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 transition-[background-color,border-color,box-shadow] duration-200 ease-apple",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
