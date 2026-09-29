"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { markCell } from "@/lib/actions/play"
import { createClient } from "@/lib/supabase/client"
import { subscribeToBingos, subscribeToPlayerCells } from "@/lib/realtime/subscriptions"
import { completedLines, linesFor } from "@/lib/bingo/winlines"
import type { ViewMode } from "@/components/common/view-toggle"
import { cn } from "@/lib/utils"

export type GridCell = {
  position: number
  challengeId: string | null
  text: string | null
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
  cells: initialCells,
  onMarkedCountChange,
  view = "grid",
}: {
  playerCardId: string
  cardId: string
  gridSize: number
  freeSpacePosition: number | null
  cells: GridCell[]
  onMarkedCountChange?: (count: number) => void
  view?: ViewMode
}) {
  const [cells, setCells] = useState<GridCell[]>(initialCells)
  const [, startTransition] = useTransition()
  const [burst, setBurst] = useState(false)

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

  function toggle(cell: GridCell) {
    if (cell.position === freeSpacePosition) return // free space is non-interactive
    const next = !cell.isMarked

    // Optimistic update.
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
        // Revert.
        setCells((prev) =>
          prev.map((c) =>
            c.position === cell.position ? { ...c, isMarked: !next } : c
          )
        )
        toast.error(res.error)
      }
    })
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
                  onClick={() => toggle(cell)}
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
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      cell.isMarked && "text-muted-foreground line-through"
                    )}
                  >
                    {cell.text}
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

          return (
            <button
              key={cell.position}
              type="button"
              onClick={() => toggle(cell)}
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
              {isFree ? (
                <span className="text-lg" aria-hidden>
                  ★
                </span>
              ) : (
                <span className="line-clamp-4">{cell.text}</span>
              )}
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}
