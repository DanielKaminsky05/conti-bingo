"use client"

import { useMemo } from "react"
import { CheckIcon } from "lucide-react"
import { completedLines, linesFor } from "@/lib/bingo/winlines"
import { TileMedia, FreeSpaceContent } from "@/components/bingo/tile-media"
import { cn } from "@/lib/utils"
import type { GridCell } from "@/components/bingo/bingo-grid"

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

/**
 * A non-interactive rendering of a player's board — same visual language as the
 * live `BingoGrid`, but read-only. Used to preview another member's card.
 */
export function ReadOnlyBingoGrid({
  gridSize,
  freeSpacePosition,
  freeSpaceImagePath,
  cells,
}: {
  gridSize: number
  freeSpacePosition: number | null
  freeSpaceImagePath?: string | null
  cells: GridCell[]
}) {
  const markedSet = useMemo(
    () => new Set(cells.filter((c) => c.isMarked).map((c) => c.position)),
    [cells]
  )
  const glowPositions = useMemo(
    () => positionsInCompletedLines(markedSet, gridSize),
    [markedSet, gridSize]
  )

  return (
    <div className={cn("grid gap-1.5 sm:gap-2", GRID_COLS[gridSize] ?? "grid-cols-5")}>
      {cells.map((cell) => {
        const isFree = cell.position === freeSpacePosition
        const inLine = glowPositions.has(cell.position)

        return (
          <div
            key={cell.position}
            aria-label={isFree ? "Free space" : cell.text ?? "Challenge"}
            className={cn(
              "relative flex aspect-square min-h-[44px] items-center justify-center overflow-hidden rounded-xl p-1.5 text-center text-[11px] font-bold leading-tight break-words hyphens-auto sm:text-xs",
              isFree
                ? "bg-free text-free-foreground"
                : cell.isMarked
                  ? "bg-marked text-marked-foreground shadow-sm"
                  : "bg-card border border-tile-border text-foreground",
              inLine && "ring-2 ring-gold"
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

            {!isFree && cell.isMarked && cell.imagePath && (
              <span
                aria-hidden
                className="absolute inset-0 z-[1] flex items-center justify-center rounded-[inherit] bg-marked/70 text-marked-foreground"
              >
                <CheckIcon className="size-6" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
