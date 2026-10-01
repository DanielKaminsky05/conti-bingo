"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signUp } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function SignupForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!accepted) {
      setError("Please accept the Terms of Service to continue.")
      return
    }
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
      <label htmlFor="accept-terms" className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <input
          id="accept-terms"
          type="checkbox"
          checked={accepted}
          onChange={(e) => {
            setAccepted(e.target.checked)
            setError(null)
          }}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          I agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Terms of Service
          </Link>
          .
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <SubmitButton pending={pending} disabled={!accepted} className="w-full">
        Create account
      </SubmitButton>
    </form>
  )
}
