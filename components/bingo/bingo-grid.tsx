"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { markCell } from "@/lib/actions/play"
import { createClient } from "@/lib/supabase/client"
import { subscribeToBingos, subscribeToPlayerCells } from "@/lib/realtime/subscriptions"
import { completedLines, linesFor } from "@/lib/bingo/winlines"
import type { ViewMode } from "@/components/common/view-toggle"
import type { ChallengeCompletions } from "@/lib/bingo/completions"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TileMedia, FreeSpaceContent } from "@/components/bingo/tile-media"
import { SquareDialog } from "@/components/bingo/square-dialog"
import { cn } from "@/lib/utils"

export type GridCell = {
  position: number
  challengeId: string | null
  text: string | null
  imagePath?: string | null
  isMarked: boolean
}

/** Positions covered by any completed line — used for the ring/glow. */
function positionsInCompletedLines(marked: Set<number>, gridSize: number): Set<number> {
  const keys = new Set(completedLines(marked, gridSize))
  const out = new Set<number>()
  for (const line of linesFor(gridSize)) {
    if (keys.has(line.key)) line.positions.forEach((p) => out.add(p))
  }
  return out
}

// Tailwind-safe explicit column templates by grid size (avoids dynamic class names).
const GRID_COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

export function BingoGrid({
  playerCardId,
  cardId,
  gridSize,
  freeSpacePosition,
  freeSpaceImagePath,
  cells: initialCells,
  onMarkedCountChange,
  view = "grid",
  completions = {},
  markingClosed = false,
}: {
  playerCardId: string
  cardId: string
  gridSize: number
  freeSpacePosition: number | null
  freeSpaceImagePath?: string | null
  cells: GridCell[]
  onMarkedCountChange?: (count: number) => void
  view?: ViewMode
  /** Per-challenge completion counts + who (load-time snapshot). */
  completions?: ChallengeCompletions
  /** Card ended + viewer isn't a host → taps are blocked. */
  markingClosed?: boolean
}) {
  const [cells, setCells] = useState<GridCell[]>(initialCells)
  const [, startTransition] = useTransition()
  const [burst, setBurst] = useState(false)
  // The challenge whose "who completed it" dialog is open (null = closed).
  const [openChallengeId, setOpenChallengeId] = useState<string | null>(null)
  // The square whose detail dialog is open (view + optional mark/unmark).
  const [openCell, setOpenCell] = useState<GridCell | null>(null)

  // Keep local state in sync if the parent re-hydrates cells.
  useEffect(() => {
    setCells(initialCells)
  }, [initialCells])

  const markedSet = useMemo(
    () => new Set(cells.filter((c) => c.isMarked).map((c) => c.position)),
    [cells]
  )

  const completedKeys = useMemo(
    () => completedLines(markedSet, gridSize),
    [markedSet, gridSize]
  )
  const glowPositions = useMemo(
    () => positionsInCompletedLines(markedSet, gridSize),
    [markedSet, gridSize]
  )

  // Report marked count upward (excludes the free space so progress reads naturally).
  useEffect(() => {
    const count = cells.filter(
      (c) => c.isMarked && c.position !== freeSpacePosition
    ).length
    onMarkedCountChange?.(count)
  }, [cells, freeSpacePosition, onMarkedCountChange])

  // Track completed line count so realtime updates can fire the celebration.
  const prevLineCount = useRef(completedKeys.length)
  useEffect(() => {
    if (completedKeys.length > prevLineCount.current) {
      triggerCelebration()
    }
    prevLineCount.current = completedKeys.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedKeys.length])

  function triggerCelebration() {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    toast.success("Bingo! 🎉", { description: "You completed a line." })
    if (!reduce) {
      setBurst(true)
      window.setTimeout(() => setBurst(false), 1200)
    }
  }

  // Realtime: keep our own cells in sync (e.g. marked on another device) and
  // celebrate when a bingo lands for this card.
  useEffect(() => {
    const supabase = createClient()

    const cellChannel = subscribeToPlayerCells(supabase, playerCardId, (payload) => {
      const row = (payload.new ?? payload.old) as
        | { position?: number; is_marked?: boolean }
        | undefined
      if (!row || typeof row.position !== "number") return
      setCells((prev) =>
        prev.map((c) =>
          c.position === row.position ? { ...c, isMarked: !!row.is_marked } : c
        )
      )
    })

    const bingoChannel = subscribeToBingos(supabase, cardId, () => {
      // Own-bingo celebration is handled by the completedKeys effect; this keeps
      // the channel warm and could drive a "someone got bingo" alert later.
    })

    return () => {
      void cellChannel.unsubscribe()
      void bingoChannel.unsubscribe()
    }
  }, [playerCardId, cardId])

  // Apply a mark/unmark: optimistic update + server call, revert on failure.
  function applyMark(cell: GridCell, next: boolean) {
    setCells((prev) =>
      prev.map((c) => (c.position === cell.position ? { ...c, isMarked: next } : c))
    )

    startTransition(async () => {
      const res = await markCell({
        playerCardId,
        position: cell.position,
        marked: next,
      })
      if (!res.ok) {
        setCells((prev) =>
          prev.map((c) =>
            c.position === cell.position ? { ...c, isMarked: !next } : c
          )
        )
        toast.error(res.error)
      }
    })
  }

  // Tapping a tile opens its detail — so the full challenge is always readable
  // (grid tiles clamp long text), with a mark/unmark action when allowed.
  function openSquare(cell: GridCell) {
    if (cell.position === freeSpacePosition) return // free space has no challenge
    setOpenCell(cell)
  }

  return (
    <div className="relative">
      {burst && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="bingo-burst text-5xl">🎉</span>
        </div>
      )}

      {view === "list" ? (
        <ul className="space-y-1.5">
          {cells
            .filter((cell) => cell.position !== freeSpacePosition)
            .map((cell) => (
              <li key={cell.position}>
                <button
                  type="button"
                  onClick={() => openSquare(cell)}
                  aria-pressed={cell.isMarked}
                  aria-label={cell.text ?? "Challenge"}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    cell.isMarked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:border-muted-foreground/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      cell.isMarked
                        ? "border-marked bg-marked text-marked-foreground"
                        : "border-tile-border"
                    )}
                  >
                    {cell.isMarked && <CheckIcon className="size-3.5" />}
                  </span>
                  {cell.imagePath && (
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-md">
                      <TileMedia imagePath={cell.imagePath} hasText={false} />
                    </span>
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      cell.isMarked && "text-muted-foreground line-through"
                    )}
                  >
                    {cell.text ?? (cell.imagePath ? "Photo square" : "")}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      ) : (
      <div
        className={cn(
          "grid gap-1.5 sm:gap-2",
          GRID_COLS[gridSize] ?? "grid-cols-5"
        )}
      >
        {cells.map((cell) => {
          const isFree = cell.position === freeSpacePosition
          const inLine = glowPositions.has(cell.position)
          const completion = cell.challengeId
            ? completions[cell.challengeId]
            : undefined
          const count = completion?.count ?? 0

          return (
            <button
              key={cell.position}
              type="button"
              onClick={() => openSquare(cell)}
              disabled={isFree}
              aria-pressed={cell.isMarked}
              aria-label={isFree ? "Free space" : cell.text ?? "Challenge"}
              className={cn(
                "relative flex aspect-square min-h-[44px] items-center justify-center rounded-xl p-1.5 text-center text-[11px] font-bold leading-tight break-words hyphens-auto transition-all duration-150 sm:text-xs",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                isFree
                  ? "bg-free text-free-foreground cursor-default"
                  : cell.isMarked
                    ? "bg-marked text-marked-foreground bingo-pop shadow-sm"
                    : "bg-card border border-tile-border text-foreground hover:border-muted-foreground/40 active:scale-95",
                inLine && "bingo-line-glow ring-2 ring-gold"
              )}
            >
              {!isFree && <TileMedia imagePath={cell.imagePath} hasText={!!cell.text} />}

              {isFree ? (
                <FreeSpaceContent imagePath={freeSpaceImagePath} />
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

              {/* Keep the marked state visible even when an image covers the tile. */}
              {!isFree && cell.isMarked && cell.imagePath && (
                <span
                  aria-hidden
                  className="absolute inset-0 z-[1] flex items-center justify-center rounded-[inherit] bg-marked/70 text-marked-foreground"
                >
                  <CheckIcon className="size-6" />
                </span>
              )}

              {/* People-completed badge: tap opens the who-list; hover shows the count.
                  Hidden on free space and when nobody has completed the square. */}
              {!isFree && cell.challengeId && count > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`${count} ${
                          count === 1 ? "player" : "players"
                        } completed this — view who`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenChallengeId(cell.challengeId)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            e.stopPropagation()
                            setOpenChallengeId(cell.challengeId)
                          }
                        }}
                      />
                    }
                    className={cn(
                      "absolute -top-1.5 -right-1.5 z-10 inline-flex min-w-4 cursor-pointer items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums shadow-sm ring-1 transition-colors",
                      cell.isMarked
                        ? "bg-background text-foreground ring-marked/40 hover:bg-muted"
                        : "bg-primary text-primary-foreground ring-primary/40 hover:bg-primary/90"
                    )}
                  >
                    {count}
                  </TooltipTrigger>
                  <TooltipContent>
                    {count} {count === 1 ? "player" : "players"} completed this
                  </TooltipContent>
                </Tooltip>
              )}
            </button>
          )
        })}
      </div>
      )}

      <CompletionsDialog
        completion={openChallengeId ? completions[openChallengeId] : undefined}
        challengeText={
          openChallengeId
            ? cells.find((c) => c.challengeId === openChallengeId)?.text ?? null
            : null
        }
        open={openChallengeId !== null}
        onOpenChange={(next) => {
          if (!next) setOpenChallengeId(null)
        }}
      />

      <SquareDialog
        open={openCell !== null}
        onOpenChange={(next) => {
          if (!next) setOpenCell(null)
        }}
        title={
          markingClosed
            ? "Challenge"
            : openCell?.isMarked
              ? "Unmark this square?"
              : "Mark this square?"
        }
        text={openCell?.text ?? null}
        imagePath={openCell?.imagePath}
        note={markingClosed ? "Marking is closed." : null}
        action={
          markingClosed || !openCell
            ? undefined
            : {
                label: openCell.isMarked ? "Unmark" : "Mark it",
                onConfirm: () => {
                  applyMark(openCell, !openCell.isMarked)
                  setOpenCell(null)
                },
              }
        }
      />
    </div>
  )
}

/** Dialog listing the players (avatar + name) who have marked a challenge. */
function CompletionsDialog({
  completion,
  challengeText,
  open,
  onOpenChange,
}: {
  completion: ChallengeCompletions[string] | undefined
  challengeText: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const users = completion?.users ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {users.length} {users.length === 1 ? "player" : "players"} completed
            this
          </DialogTitle>
          {challengeText && (
            <DialogDescription>{challengeText}</DialogDescription>
          )}
        </DialogHeader>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {users.map((u) => {
            const avatarUrl = publicStorageUrl("avatars", u.avatarPath)
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <Avatar size="sm">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                  <AvatarFallback>
                    {u.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {u.name}
                </span>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
