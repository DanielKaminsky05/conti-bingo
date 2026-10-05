"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { confirmEmailToken } from "@/lib/actions/auth"
import { SubmitButton } from "@/components/common/submit-button"

export function ConfirmForm({
  tokenHash,
  type,
  next,
  action,
}: {
  tokenHash: string
  type: string
  next?: string
  action: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await confirmEmailToken({ tokenHash, type, next })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.replace(res.data.next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <SubmitButton pending={pending} className="w-full">
        {action}
      </SubmitButton>
    </form>
  )
}
