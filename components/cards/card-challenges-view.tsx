"use client"

import { freeSpacePosition } from "@/lib/bingo/layout"
import { Badge } from "@/components/ui/badge"
import { ViewToggle, useViewMode } from "@/components/common/view-toggle"
import { cn } from "@/lib/utils"

export type CardChallenge = { id: string; text: string; points: number }

const GRID_COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

/**
 * Read-only rendering of a card's challenges, switchable between the bingo board
 * (challenges placed in order, free space centered) and a numbered list.
 */
export function CardChallengesView({
  challenges,
  gridSize,
  freeSpace,
}: {
  challenges: CardChallenge[]
  gridSize: number
  freeSpace: boolean
}) {
  const [mode, setMode] = useViewMode("card-challenges-view", "grid")

  const freePos = freeSpace ? freeSpacePosition(gridSize) : -1

  // Board: one cell per position; non-free positions take challenges in order.
  let ci = -1
  const tiles = Array.from({ length: gridSize * gridSize }, (_, pos) => {
    if (pos === freePos) return { pos, free: true as const, challenge: null }
    ci += 1
    return { pos, free: false as const, challenge: challenges[ci] ?? null }
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Challenges ({challenges.length})
        </h3>
        <ViewToggle value={mode} onChange={setMode} size="sm" />
      </div>

      {mode === "grid" ? (
        <div className={cn("grid gap-1.5 sm:gap-2", GRID_COLS[gridSize] ?? "grid-cols-5")}>
          {tiles.map((tile) => {
            if (tile.free) {
              return (
                <div
                  key={tile.pos}
                  aria-label="Free space"
                  className="flex aspect-square items-center justify-center rounded-xl bg-free text-free-foreground text-lg"
                >
                  ★
                </div>
              )
            }
            return (
              <div
                key={tile.pos}
                className="relative flex aspect-square items-center justify-center rounded-xl border border-tile-border bg-card p-1.5 text-center text-[11px] font-bold leading-tight break-words hyphens-auto sm:text-xs"
              >
                <span className="line-clamp-4">{tile.challenge?.text}</span>
                {tile.challenge && tile.challenge.points > 1 && (
                  <span className="absolute right-1 top-1 rounded bg-gold/20 px-1 text-[9px] text-gold">
                    {tile.challenge.points}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <ol className="space-y-2">
          {challenges.map((c, i) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">{c.text}</span>
              <Badge variant="outline">
                {c.points} {c.points === 1 ? "pt" : "pts"}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
