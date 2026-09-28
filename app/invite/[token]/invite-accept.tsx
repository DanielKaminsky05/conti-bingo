"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { acceptInvite } from "@/lib/actions/invites"
import { SubmitButton } from "@/components/common/submit-button"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function InviteAccept({
  token,
  groupName,
  signedIn,
}: {
  token: string
  groupName: string
  signedIn: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!signedIn) {
    return (
      <div className="space-y-3">
        <Link
          href={`/login?next=/invite/${token}`}
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
        >
          Sign in to accept
        </Link>
        <p className="text-xs text-muted-foreground">
          Sign in or create an account to join {groupName}.
        </p>
      </div>
    )
  }

  function onAccept() {
    setError(null)
    start(async () => {
      const res = await acceptInvite({ token })
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success(`Welcome to ${groupName}!`)
      router.push(`/groups/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <SubmitButton pending={pending} onClick={onAccept} className="w-full">
        Accept invite
      </SubmitButton>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
