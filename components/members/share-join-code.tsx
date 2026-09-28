"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CopyIcon, CheckIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { regenerateJoinCode } from "@/lib/actions/groups"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ShareJoinCode({
  groupId,
  code,
}: {
  groupId: string
  code: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [currentCode, setCurrentCode] = useState(code)
  const [copied, setCopied] = useState(false)
  // Empty on the server AND first client render (avoids a hydration mismatch),
  // then filled to the absolute origin after mount.
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])

  const joinPath = `/join/${currentCode}`
  const joinLink = origin ? `${origin}${joinPath}` : joinPath

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinLink)
      setCopied(true)
      toast.success("Join link copied.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy. Copy the link manually.")
    }
  }

  function rotate() {
    startTransition(async () => {
      const res = await regenerateJoinCode({ groupId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setCurrentCode(res.data.joinCode)
      setCopied(false)
      toast.success("New join code generated.")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Group join code
          </p>
          <p className="font-heading text-3xl font-bold tracking-[0.2em] tabular-nums">
            {currentCode}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground">
              {joinLink}
            </div>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone with this link or code can join the group.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={rotate}
            disabled={pending}
            className={cn(pending && "opacity-70")}
          >
            <RefreshCwIcon className={cn(pending && "animate-spin")} />
            Rotate code
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
