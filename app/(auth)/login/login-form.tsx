"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    setNeedsConfirm(false)
    start(async () => {
      const res = await signIn({
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
      })
      if (!res.ok) {
        setError(res.error)
        if (res.code === "forbidden") setNeedsConfirm(true)
        return
      }
      const next = searchParams.get("next")
      router.replace(next && next.startsWith("/") ? next : "/")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && (
        <p className="text-sm text-destructive">
          {error}
          {needsConfirm && (
            <>
              {" — "}
              <Link href="/confirm-email" className="underline underline-offset-2">
                resend confirmation
              </Link>
            </>
          )}
        </p>
      )}
      <SubmitButton pending={pending} className="w-full">
        Sign in
      </SubmitButton>
    </form>
  )
}
