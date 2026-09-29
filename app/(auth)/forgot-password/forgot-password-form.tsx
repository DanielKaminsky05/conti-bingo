"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { requestPasswordReset } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function ForgotPasswordForm() {
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await requestPasswordReset({ email: String(fd.get("email") ?? "") })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSent(true)
      toast.success("Check your inbox for a reset link.")
    })
  }

  if (sent) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        If an account exists for that email, we&apos;ve sent a password reset link. It may
        take a few minutes to arrive.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <SubmitButton pending={pending} className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  )
}
