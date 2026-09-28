"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { joinGroup } from "@/lib/actions/groups"
import { SubmitButton } from "@/components/common/submit-button"

export function JoinConfirm({ code }: { code: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onJoin() {
    setError(null)
    start(async () => {
      const res = await joinGroup({ joinCode: code })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Joined the group.")
      router.push(`/groups/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <SubmitButton pending={pending} onClick={onJoin} className="w-full">
        Join group
      </SubmitButton>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
