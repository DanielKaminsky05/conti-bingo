"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { resendConfirmation } from "@/lib/actions/auth"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function ResendForm({ email }: { email: string }) {
  const [pending, start] = useTransition()

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
        {/* Fixed to the address you signed up with — not editable here. To
            confirm a different address, sign up again with that email. */}
        <p
          id="resend-email"
          className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium break-all"
        >
          {email}
        </p>
      </div>
      <SubmitButton pending={pending} variant="outline" className="w-full">
        Resend confirmation email
      </SubmitButton>
    </form>
  )
}
