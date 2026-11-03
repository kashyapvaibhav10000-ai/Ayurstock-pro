import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35",
  {
    variants: {
      variant: {
        default:
          "bg-link/10 text-link",
        secondary:
          "bg-fill-strong text-label-secondary",
        destructive:
          "bg-danger/10 text-danger",
        outline: "border border-separator-strong text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
