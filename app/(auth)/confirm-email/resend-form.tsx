"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { resendConfirmation } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function ResendForm({ defaultEmail }: { defaultEmail?: string }) {
  const [pending, start] = useTransition()
  const [email, setEmail] = useState(defaultEmail ?? "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    start(async () => {
      const res = await resendConfirmation({ email })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Confirmation email sent.")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <SubmitButton pending={pending} variant="outline" className="w-full">
        Resend confirmation email
      </SubmitButton>
    </form>
  )
}
