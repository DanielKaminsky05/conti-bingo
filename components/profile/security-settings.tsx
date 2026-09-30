"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateEmail, updatePassword } from "@/lib/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

/** Change email + password for the signed-in user. */
export function SecuritySettings({ currentEmail }: { currentEmail: string | null }) {
  return (
    <div className="space-y-8">
      <EmailForm currentEmail={currentEmail} />
      <PasswordForm />
    </div>
  )
}

function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [pending, start] = useTransition()
  const [email, setEmail] = useState("")

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = email.trim()
    if (!next) return
    start(async () => {
      const res = await updateEmail({ email: next })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Check your inbox to confirm the new email.")
      setEmail("")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-base font-semibold">Email</h2>
        {currentEmail && (
          <p className="text-sm text-muted-foreground">
            Current: <span className="text-foreground">{currentEmail}</span>
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">New email</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll send a confirmation link to the new address. Your current email keeps
          working until you confirm.
        </p>
      </div>
      <SubmitButton pending={pending} type="submit" disabled={!email.trim()}>
        Update email
      </SubmitButton>
    </form>
  )
}

function PasswordForm() {
  const [pending, start] = useTransition()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    start(async () => {
      const res = await updatePassword({ password, confirm })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Password updated.")
      setPassword("")
      setConfirm("")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="font-heading text-base font-semibold">Password</h2>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setError(null)
          }}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <SubmitButton pending={pending} type="submit" disabled={!password || !confirm}>
        Update password
      </SubmitButton>
    </form>
  )
}
