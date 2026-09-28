"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { subscribeToBingos } from "@/lib/realtime/subscriptions"
import { rankPlayers } from "@/lib/bingo/rank"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/**
 * A leaderboard row shaped like the `leaderboard` view (plus the rank-relevant
 * counters coerced to non-null). Matches `LeaderboardRow` from
 * `@/lib/queries/leaderboard`, but redeclared here so this client component has
 * no server-only imports.
 */
export type LeaderboardRow = {
  card_id: string | null
  user_id: string
  name: string | null
  username: string | null
  avatar_path: string | null
  bingo_count: number
  points_total: number
  marks_count: number
  first_bingo_at: string | null
}

function rankIcon(rank: number): string | null {
  if (rank === 1) return "🥇"
  if (rank === 2) return "🥈"
  if (rank === 3) return "🥉"
  return null
}

export function Leaderboard({
  rows,
  cardId,
  currentUserId,
  preview = false,
  previewLimit = 5,
}: {
  rows: LeaderboardRow[]
  cardId: string
  currentUserId?: string | null
  preview?: boolean
  previewLimit?: number
}) {
  // Keep raw (un-capped) rows in state so realtime re-ranks stay stable.
  const [ranked, setRanked] = useState<LeaderboardRow[]>(() => rankPlayers(rows))

  // Re-rank whenever the server passes fresh rows (e.g. router.refresh()).
  useEffect(() => {
    setRanked(rankPlayers(rows))
  }, [rows])

  // Live re-rank: on any bingo change for this card, re-read the view.
  useEffect(() => {
    if (!cardId) return
    const supabase = createClient()

    const refetch = async () => {
      const { data } = await supabase.from("leaderboard").select("*").eq("card_id", cardId)
      if (!data) return
      const normalized: LeaderboardRow[] = data.map((row) => ({
        card_id: row.card_id,
        user_id: row.user_id ?? "",
        name: row.name,
        username: row.username,
        avatar_path: row.avatar_path,
        bingo_count: row.bingo_count ?? 0,
        points_total: row.points_total ?? 0,
        marks_count: row.marks_count ?? 0,
        first_bingo_at: row.first_bingo_at,
      }))
      setRanked(rankPlayers(normalized))
    }

    const channel = subscribeToBingos(supabase, cardId, () => {
      void refetch()
    })

    return () => {
      void channel.unsubscribe()
    }
  }, [cardId])

  const visible = preview ? ranked.slice(0, previewLimit) : ranked

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
        No players yet. Be the first to mark a square.
      </p>
    )
  }

  return (
    <ol className="space-y-1.5">
      {visible.map((row, i) => {
        const rank = i + 1
        const isMe = !!currentUserId && row.user_id === currentUserId
        const displayName = row.name || row.username || "Player"
        const avatarUrl = publicStorageUrl("avatars", row.avatar_path)
        const medal = rankIcon(rank)

        return (
          <li
            key={row.user_id || rank}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors",
              isMe
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-card"
            )}
          >
            <div className="flex w-7 shrink-0 justify-center">
              {medal ? (
                <span className="text-lg leading-none" aria-label={`Rank ${rank}`}>
                  {medal}
                </span>
              ) : (
                <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                  {rank}
                </span>
              )}
            </div>

            <Avatar size="sm">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {displayName}
                {isMe && <span className="ml-1.5 text-xs text-primary">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.marks_count} {row.marks_count === 1 ? "square" : "squares"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3 text-right">
              <div className="w-10">
                <p className="text-sm font-semibold tabular-nums">{row.bingo_count}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  bingo{row.bingo_count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="w-12">
                <p className="text-sm font-semibold tabular-nums text-gold">{row.points_total}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">pts</p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
