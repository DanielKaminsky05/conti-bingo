"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { getOrCreateCoopBoard, markCoopCell } from "@/lib/actions/coop"
import { createClient } from "@/lib/supabase/client"
import { subscribeToCoopBoard, subscribeToCoopCells } from "@/lib/realtime/subscriptions"
import { freeSpacePosition } from "@/lib/bingo/layout"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { TileMedia } from "@/components/bingo/tile-media"
import { cn } from "@/lib/utils"

type Challenge = { id: string; text: string | null; imagePath?: string | null }

export type CoopBoardCard = {
  id: string
  grid_size: number
  free_space: boolean
  challenges: Challenge[]
}

type CoopCell = {
  position: number
  challengeId: string | null
  text: string | null
  imagePath: string | null
  isMarked: boolean
  markedBy: string | null
  markerName: string | null
  markerAvatar: string | null
}

const GRID_COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

export function CoopBoard({
  card,
  currentUserId,
  canMark,
}: {
  card: CoopBoardCard
  currentUserId: string | null
  /** Only group hosts (owner/admin) may mark/unmark; members watch live. */
  canMark: boolean
}) {
  const [boardId, setBoardId] = useState<string | null>(null)
  const [cells, setCells] = useState<CoopCell[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [burst, setBurst] = useState(false)

  const freePos = card.free_space ? freeSpacePosition(card.grid_size) : null

  const challengeText = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of card.challenges) m.set(c.id, c.text ?? "")
    return m
  }, [card.challenges])
  const challengeImage = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const c of card.challenges) m.set(c.id, c.imagePath ?? null)
    return m
  }, [card.challenges])

  // Load the shared board's cells (RLS: any group member can read them).
  const loadCells = useCallback(
    async (bId: string) => {
      const supabase = createClient()
      const { data, error: cellsError } = await supabase
        .from("coop_board_cells")
        .select(
          "position, challenge_id, is_marked, marked_by, marker:profiles!coop_board_cells_marked_by_fkey(name, avatar_path)"
        )
        .eq("board_id", bId)
        .order("position", { ascending: true })

      if (cellsError) {
        setError(cellsError.message)
        return
      }

      type Row = {
        position: number
        challenge_id: string | null
        is_marked: boolean
        marked_by: string | null
        marker: { name: string | null; avatar_path: string | null } | null
      }
      const mapped: CoopCell[] = ((data ?? []) as unknown as Row[]).map((row) => ({
        position: row.position,
        challengeId: row.challenge_id,
        text: row.challenge_id ? challengeText.get(row.challenge_id) ?? "" : null,
        imagePath: row.challenge_id ? challengeImage.get(row.challenge_id) ?? null : null,
        isMarked: row.is_marked,
        markedBy: row.marked_by,
        markerName: row.marker?.name ?? null,
        markerAvatar: row.marker?.avatar_path ?? null,
      }))
      setCells(mapped)
    },
    [challengeText, challengeImage]
  )

  // Ensure the board exists, then load it.
  useEffect(() => {
    let cancelled = false
    async function ensure() {
      const res = await getOrCreateCoopBoard({ cardId: card.id })
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      setBoardId(res.data.boardId)
      await loadCells(res.data.boardId)
    }
    void ensure()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const triggerCelebration = useCallback(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    toast.success("Blackout! 🎉", { description: "Your group filled the whole board!" })
    if (!reduce) {
      setBurst(true)
      window.setTimeout(() => setBurst(false), 1400)
    }
  }, [])

  // Realtime: any member's mark, and the team-blackout celebration.
  useEffect(() => {
    if (!boardId) return
    const supabase = createClient()

    const cellChannel = subscribeToCoopCells(supabase, boardId, () => {
      // Re-read the (small) board so marker names/avatars stay accurate.
      void loadCells(boardId)
    })
    const boardChannel = subscribeToCoopBoard(supabase, boardId, (payload) => {
      const row = payload.new as { completed_at?: string | null } | undefined
      if (row?.completed_at) triggerCelebration()
    })

    return () => {
      void cellChannel.unsubscribe()
      void boardChannel.unsubscribe()
    }
  }, [boardId, loadCells, triggerCelebration])

  const total = cells?.length ?? 0
  const marked = cells?.filter((c) => c.isMarked).length ?? 0
  const remaining = total - marked

  // Celebrate when the team completes the board (all squares marked).
  const prevRemaining = useRef<number | null>(null)
  useEffect(() => {
    if (cells && total > 0 && remaining === 0 && prevRemaining.current !== 0) {
      triggerCelebration()
    }
    prevRemaining.current = cells ? remaining : null
  }, [remaining, total, cells, triggerCelebration])

  function toggle(cell: CoopCell) {
    if (!boardId) return
    if (cell.position === freePos) return
    // Only hosts may mark/unmark; members just watch.
    if (!canMark) return

    const next = !cell.isMarked
    setCells((prev) =>
      prev
        ? prev.map((c) =>
            c.position === cell.position
              ? {
                  ...c,
                  isMarked: next,
                  markedBy: next ? currentUserId : null,
                  markerName: next ? "You" : null,
                  markerAvatar: null,
                }
              : c
          )
        : prev
    )

    startTransition(async () => {
      const res = await markCoopCell({ cardId: card.id, position: cell.position, marked: next })
      if (!res.ok) {
        toast.error(res.error)
        void loadCells(boardId) // re-sync to the authoritative state
      }
    })
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
        Couldn&apos;t load the group board. {error}
      </div>
    )
  }

  if (!cells) return <CoopSkeleton gridSize={card.grid_size} />

  return (
    <div className="relative mx-auto w-full max-w-md space-y-3">
      {burst && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="bingo-burst text-5xl">🎉</span>
        </div>
      )}

      <div className={cn("grid gap-1.5 sm:gap-2", GRID_COLS[card.grid_size] ?? "grid-cols-5")}>
        {cells.map((cell) => {
          const isFree = cell.position === freePos
          const avatarUrl = publicStorageUrl("avatars", cell.markerAvatar)
          // Members can't interact; hosts can toggle any square.
          const interactive = canMark && !isFree

          return (
            <button
              key={cell.position}
              type="button"
              onClick={() => toggle(cell)}
              disabled={!interactive}
              aria-pressed={cell.isMarked}
              aria-label={isFree ? "Free space" : cell.text ?? "Square"}
              className={cn(
                "relative flex aspect-square min-h-[44px] items-center justify-center overflow-hidden rounded-xl p-1.5 text-center text-[11px] font-bold leading-tight break-words hyphens-auto transition-all duration-150 sm:text-xs",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                isFree
                  ? "bg-free text-free-foreground cursor-default"
                  : cell.isMarked
                    ? "bg-marked text-marked-foreground shadow-sm"
                    : "bg-card border border-tile-border text-foreground",
                interactive && !cell.isMarked && "hover:border-muted-foreground/40 active:scale-95",
                !interactive && "cursor-default"
              )}
            >
              {!isFree && <TileMedia imagePath={cell.imagePath} hasText={!!cell.text} />}

              {isFree ? (
                <span className="text-lg" aria-hidden>
                  ★
                </span>
              ) : (
                cell.text && (
                  <span
                    className={cn(
                      "line-clamp-4",
                      cell.imagePath &&
                        "relative z-[1] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    )}
                  >
                    {cell.text}
                  </span>
                )
              )}

              {/* Marked overlay + who got it. */}
              {!isFree && cell.isMarked && (
                <>
                  {cell.imagePath && (
                    <span
                      aria-hidden
                      className="absolute inset-0 z-[1] rounded-[inherit] bg-marked/70"
                    />
                  )}
                  <span className="absolute -bottom-1 -right-1 z-[2]">
                    <Avatar size="sm" className="size-6 ring-2 ring-background">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-[9px]">
                        {(cell.markerName ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </span>
                  {!cell.imagePath && (
                    <CheckIcon className="absolute left-1 top-1 z-[1] size-3.5 opacity-80" />
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{marked}</span>/{total} squares
        {remaining > 0 ? (
          <>
            {" · "}
            <span className="font-semibold text-foreground">{remaining}</span> to blackout
          </>
        ) : (
          <span className="text-primary"> · blackout complete! 🎉</span>
        )}
      </p>

      {!canMark && (
        <p className="text-center text-xs text-muted-foreground">
          Only hosts can mark squares. Watch the board fill in live!
        </p>
      )}
    </div>
  )
}

function CoopSkeleton({ gridSize }: { gridSize: number }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className={cn("grid gap-1.5 sm:gap-2", GRID_COLS[gridSize] ?? "grid-cols-5")}>
        {Array.from({ length: gridSize * gridSize }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
      <Skeleton className="mx-auto h-4 w-40" />
    </div>
  )
}
