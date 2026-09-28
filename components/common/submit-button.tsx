"use client"

import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ComponentProps } from "react"

export function SubmitButton({
  pending,
  children,
  disabled,
  type = "submit",
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type={type} disabled={pending || disabled} {...props}>
      {pending && <Loader2Icon className="size-4 animate-spin" />}
      {children}
    </Button>
  )
}
