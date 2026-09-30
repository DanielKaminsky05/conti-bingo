"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { freeSpacePosition } from "@/lib/bingo/layout"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ReadOnlyBingoGrid } from "@/components/bingo/read-only-bingo-grid"
import type { GridCell } from "@/components/bingo/bingo-grid"

export type CoopViewCard = {
  gridSize: number
  freeSpace: boolean
  freeSpaceImagePath?: string | null
  challenges: { id: string; text: string | null; imagePath?: string | null }[]
}

export type CoopViewPlayer = {
  userId: string
  name: string
  avatarPath: string | null
  isMe: boolean
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cells: GridCell[]; count: number }

/**
 * Shows the shared class board with a single contributor's squares highlighted
 * (theirs are "marked"; everyone else's are dimmed) — the class-card analog of
 * the individual PlayerCardDialog.
 */
export function CoopPlayerDialog({
  boardId,
  card,
  player,
  onOpenChange,
}: {
  boardId: string | null
  card: CoopViewCard
  player: CoopViewPlayer | null
  onOpenChange: (open: boolean) => void
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" })

  const text = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of card.challenges) m.set(c.id, c.text ?? "")
    return m
  }, [card.challenges])
  const image = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of card.challenges) m.set(c.id, c.imagePath ?? null)
    return m
  }, [card.challenges])

  const freePos = card.freeSpace ? freeSpacePosition(card.gridSize) : null

  useEffect(() => {
    if (!player || !boardId) return
    let cancelled = false
    setState({ status: "loading" })

    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("coop_board_cells")
        .select("position, challenge_id, is_marked, marked_by")
        .eq("board_id", boardId as string)
        .order("position", { ascending: true })

      if (cancelled) return
      if (error) {
        setState({ status: "error", message: error.message })
        return
      }

      type Row = {
        position: number
        challenge_id: string | null
        is_marked: boolean
        marked_by: string | null
      }
      let count = 0
      const cells: GridCell[] = (data ?? []).map((row: Row) => {
        const mine = row.is_marked && row.marked_by === player!.userId
        if (mine && row.challenge_id) count += 1
        return {
          position: row.position,
          challengeId: row.challenge_id,
          text: row.challenge_id ? text.get(row.challenge_id) ?? "" : null,
          imagePath: row.challenge_id ? image.get(row.challenge_id) ?? null : null,
          // Highlight only THIS contributor's squares.
          isMarked: mine,
        }
      })
      setState({ status: "ready", cells, count })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [player, boardId, text, image])

  const avatarUrl = player ? publicStorageUrl("avatars", player.avatarPath) : null

  return (
    <Dialog open={player !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        {player && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback>{player.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">
                    {player.name}
                    {player.isMe && (
                      <span className="ml-1.5 text-xs font-normal text-primary">(you)</span>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {state.status === "ready"
                      ? `Marked ${state.count} ${state.count === 1 ? "square" : "squares"}`
                      : "Their squares"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {state.status === "loading" && (
              <div
                className={`grid gap-1.5 sm:gap-2 ${
                  { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" }[
                    card.gridSize
                  ] ?? "grid-cols-5"
                }`}
              >
                {Array.from({ length: card.gridSize * card.gridSize }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-xl" />
                ))}
              </div>
            )}

            {state.status === "error" && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
                Couldn&apos;t load the board. {state.message}
              </p>
            )}

            {state.status === "ready" && (
              <ReadOnlyBingoGrid
                gridSize={card.gridSize}
                freeSpacePosition={freePos}
                freeSpaceImagePath={card.freeSpaceImagePath}
                cells={state.cells}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
