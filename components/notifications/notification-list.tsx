"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BellIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { subscribeToNotifications } from "@/lib/realtime/notifications"
import { markNotificationRead } from "@/lib/actions/notifications"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Tables } from "@/lib/supabase/database.types"

type Notification = Tables<"notifications">

function payloadValue(payload: Notification["payload"], key: string): string | undefined {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = (payload as Record<string, unknown>)[key]
    if (typeof v === "string" && v.trim()) return v
    if (typeof v === "number") return String(v)
  }
  return undefined
}

function describe(n: Notification): { title: string; body?: string } {
  const p = n.payload
  const group = payloadValue(p, "group_name")
  const actor =
    payloadValue(p, "actor_name") ??
    payloadValue(p, "name") ??
    payloadValue(p, "username")
  const card = payloadValue(p, "card_title") ?? payloadValue(p, "title")
  const inGroup = group ? ` in ${group}` : ""

  switch (n.type) {
    case "member_joined":
      return {
        title: `${actor ?? "Someone"} joined${inGroup}`,
        body: "Say hi and get playing.",
      }
    case "invite_received":
      return {
        title: group ? `You were invited to ${group}` : "You received an invite",
        body: actor ? `Invited by ${actor}.` : undefined,
      }
    case "card_published":
      return {
        title: card ? `New card: ${card}` : "A new bingo card is live",
        body: group ? `A game just started${inGroup}.` : "A game just started.",
      }
    case "card_replaced":
      return {
        title: card ? `Card replaced with ${card}` : "The active card was replaced",
        body: group ? `The board changed${inGroup}.` : "The board changed.",
      }
    case "bingo_achieved":
      return {
        title: `${actor ?? "Someone"} got BINGO${inGroup}!`,
        body: card ? `On ${card}.` : undefined,
      }
    case "out_bingoed":
      return {
        title: `${actor ?? "Someone"} out-bingoed you${inGroup}`,
        body: "Time for a comeback.",
      }
    default:
      return { title: "New activity" }
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationList({
  initial,
  userId,
}: {
  initial: Notification[]
  userId: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>(initial)
  const [pending, start] = useTransition()

  const hasUnread = useMemo(() => items.some((n) => !n.read_at), [items])

  useEffect(() => {
    const client = createClient()
    const channel = subscribeToNotifications(client, userId, (payload) => {
      setItems((prev) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as Notification
          if (prev.some((n) => n.id === row.id)) return prev
          return [row, ...prev]
        }
        if (payload.eventType === "UPDATE") {
          const row = payload.new as Notification
          return prev.map((n) => (n.id === row.id ? row : n))
        }
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as Partial<Notification>
          return prev.filter((n) => n.id !== oldRow.id)
        }
        return prev
      })
    })

    return () => {
      client.removeChannel(channel)
    }
  }, [userId])

  function markOne(id: string) {
    // Optimistic — reconciled by realtime UPDATE.
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    )
    start(async () => {
      const res = await markNotificationRead({ id })
      if (!res.ok) {
        toast.error(res.error)
        router.refresh()
      }
    })
  }

  function markAll() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    start(async () => {
      const res = await markNotificationRead({})
      if (!res.ok) {
        toast.error(res.error)
        router.refresh()
        return
      }
      toast.success("All caught up.")
    })
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellIcon />}
        title="No notifications yet"
        description="When there's activity in your groups, it'll show up here."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={markAll}
          disabled={pending || !hasUnread}
        >
          Mark all read
        </Button>
      </div>

      <ul className="space-y-2">
        {items.map((n) => {
          const { title, body } = describe(n)
          const unread = !n.read_at
          return (
            <li key={n.id}>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 ring-1 ring-transparent transition-colors",
                  unread ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    unread ? "bg-primary" : "bg-transparent"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm leading-snug font-medium">{title}</p>
                  {body && <p className="text-sm text-muted-foreground">{body}</p>}
                  <p className="text-xs text-muted-foreground">{relativeTime(n.created_at)}</p>
                </div>
                {unread && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => markOne(n.id)}
                    disabled={pending}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
