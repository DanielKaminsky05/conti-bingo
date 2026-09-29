"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { subscribeToCoopCells } from "@/lib/realtime/subscriptions"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { CoopContributionRow } from "@/lib/bingo/coop-standings"

/**
 * Co-op contributions standings — who has marked how many squares on the shared
 * board, plus the team's overall progress. Server-rendered rows; a realtime
 * subscription to the board triggers a refresh as squares are claimed.
 */
export function CoopStandings({
  rows,
  boardId,
  total,
  marked,
  completed,
  currentUserId,
}: {
  rows: CoopContributionRow[]
  boardId: string | null
  total: number
  marked: number
  completed: boolean
  currentUserId: string | null
}) {
  const router = useRouter()

  useEffect(() => {
    if (!boardId) return
    const supabase = createClient()
    const channel = subscribeToCoopCells(supabase, boardId, () => router.refresh())
    return () => {
      void channel.unsubscribe()
    }
  }, [boardId, router])

  const remaining = total - marked
  const pct = total > 0 ? Math.round((marked / total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Team progress */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium">Team progress</span>
          <span className="text-sm text-muted-foreground">
            {completed ? "Blackout! 🎉" : `${remaining} to blackout`}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{marked}</span>/{total} squares filled
        </p>
      </div>

      {/* Contributions */}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
          No squares marked yet. Be the first to claim one!
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const avatarUrl = publicStorageUrl("avatars", r.avatarPath)
            const isMe = r.userId === currentUserId
            return (
              <li
                key={r.userId}
                className={cnRow(isMe)}
              >
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <Avatar size="sm">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback>{(r.name ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.name ?? "Member"}
                  {isMe && <span className="ml-1.5 text-xs text-primary">(you)</span>}
                </span>
                <div className="flex shrink-0 items-center gap-3 text-right">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{r.squares}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      squares
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold tabular-nums text-gold">{r.points}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">pts</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function cnRow(isMe: boolean): string {
  return [
    "flex items-center gap-3 rounded-xl border px-3 py-2",
    isMe ? "border-primary/40 bg-primary/5" : "border-border bg-card",
  ].join(" ")
}
