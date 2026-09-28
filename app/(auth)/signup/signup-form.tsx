"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { signUp } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function SignupForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get("email") ?? "")
    setError(null)
    start(async () => {
      const res = await signUp({
        name: String(fd.get("name") ?? ""),
        email,
        password: String(fd.get("password") ?? ""),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.replace(`/confirm-email?email=${encodeURIComponent(email)}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" type="text" autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <SubmitButton pending={pending} className="w-full">
        Create account
      </SubmitButton>
    </form>
  )
}
