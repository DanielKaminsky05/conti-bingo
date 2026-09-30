"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { freeSpacePosition } from "@/lib/bingo/layout"
import { publicStorageUrl } from "@/lib/storage-url"
import { ViewToggle, useViewMode } from "@/components/common/view-toggle"
import { cn } from "@/lib/utils"
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
import { TileMedia } from "@/components/bingo/tile-media"
import type { GridCell } from "@/components/bingo/bingo-grid"

export type ViewablePlayer = {
  userId: string
  name: string
  avatarPath: string | null
  isMe: boolean
}

export type ViewableCard = {
  id: string
  gridSize: number
  freeSpace: boolean
  freeSpaceImagePath?: string | null
  challenges: { id: string; text: string | null; imagePath?: string | null }[]
}

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; cells: GridCell[] }

export function PlayerCardDialog({
  card,
  player,
  onOpenChange,
}: {
  card: ViewableCard
  player: ViewablePlayer | null
  onOpenChange: (open: boolean) => void
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [view, setView] = useViewMode("player-card-view", "grid")

  const challengeText = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of card.challenges) map.set(c.id, c.text ?? "")
    return map
  }, [card.challenges])

  const challengeImage = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const c of card.challenges) map.set(c.id, c.imagePath ?? null)
    return map
  }, [card.challenges])

  const freePos = card.freeSpace ? freeSpacePosition(card.gridSize) : null

  useEffect(() => {
    if (!player) return
    let cancelled = false
    setState({ status: "loading" })

    async function load() {
      const supabase = createClient()

      const { data: pc, error: pcError } = await supabase
        .from("player_cards")
        .select("id")
        .eq("card_id", card.id)
        .eq("user_id", player!.userId)
        .maybeSingle()

      if (cancelled) return
      if (pcError) {
        setState({ status: "error", message: pcError.message })
        return
      }
      if (!pc) {
        setState({ status: "empty" })
        return
      }

      const { data: rows, error: cellsError } = await supabase
        .from("player_card_cells")
        .select("position, challenge_id, is_marked")
        .eq("player_card_id", pc.id)
        .order("position", { ascending: true })

      if (cancelled) return
      if (cellsError) {
        setState({ status: "error", message: cellsError.message })
        return
      }

      const cells: GridCell[] = (rows ?? []).map((row) => ({
        position: row.position,
        challengeId: row.challenge_id,
        text: row.challenge_id ? challengeText.get(row.challenge_id) ?? "" : null,
        imagePath: row.challenge_id ? challengeImage.get(row.challenge_id) ?? null : null,
        isMarked: row.is_marked,
      }))
      setState({ status: "ready", cells })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [player, card.id, challengeText, challengeImage])

  const avatarUrl = player ? publicStorageUrl("avatars", player.avatarPath) : null
  const markedCount =
    state.status === "ready"
      ? state.cells.filter((c) => c.isMarked && c.position !== freePos).length
      : 0

  return (
    <Dialog open={player !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        {player && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback>
                    {player.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">
                    {player.name}
                    {player.isMe && (
                      <span className="ml-1.5 text-xs font-normal text-primary">
                        (you)
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {state.status === "ready"
                      ? `${markedCount} ${markedCount === 1 ? "square" : "squares"} marked`
                      : "Their bingo card"}
                  </DialogDescription>
                </div>
                {state.status === "ready" && (
                  <ViewToggle value={view} onChange={setView} size="sm" />
                )}
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

            {state.status === "empty" && (
              <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
                {player.isMe
                  ? "You haven't opened your card yet."
                  : `${player.name} hasn't started their card yet.`}
              </p>
            )}

            {state.status === "error" && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
                Couldn&apos;t load this card. {state.message}
              </p>
            )}

            {state.status === "ready" &&
              (view === "grid" ? (
                <ReadOnlyBingoGrid
                  gridSize={card.gridSize}
                  freeSpacePosition={freePos}
                  freeSpaceImagePath={card.freeSpaceImagePath}
                  cells={state.cells}
                />
              ) : (
                <ul className="space-y-1.5">
                  {state.cells
                    .filter((c) => c.position !== freePos)
                    .map((c) => (
                      <li
                        key={c.position}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                          c.isMarked
                            ? "border-marked/50 bg-marked/10"
                            : "border-border bg-card opacity-70"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border",
                            c.isMarked
                              ? "border-marked bg-marked text-marked-foreground"
                              : "border-tile-border"
                          )}
                        >
                          {c.isMarked && <CheckIcon className="size-3.5" />}
                        </span>
                        {c.imagePath && (
                          <span className="relative size-9 shrink-0 overflow-hidden rounded-md">
                            <TileMedia imagePath={c.imagePath} hasText={false} />
                          </span>
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1",
                            c.isMarked && "text-muted-foreground line-through"
                          )}
                        >
                          {c.text ?? (c.imagePath ? "Photo square" : "")}
                        </span>
                      </li>
                    ))}
                </ul>
              ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
