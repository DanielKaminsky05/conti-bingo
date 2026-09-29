"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { getOrCreatePlayerCard } from "@/lib/actions/play"
import { createClient } from "@/lib/supabase/client"
import { freeSpacePosition } from "@/lib/bingo/layout"
import { linesFor } from "@/lib/bingo/winlines"
import { Skeleton } from "@/components/ui/skeleton"
import { BingoGrid, type GridCell } from "@/components/bingo/bingo-grid"
import { ViewToggle, useViewMode } from "@/components/common/view-toggle"
import type { ChallengeCompletions } from "@/lib/bingo/completions"

type Challenge = { id: string; text: string }

export type BingoBoardCard = {
  id: string
  grid_size: number
  free_space: boolean
  layout_mode: string
  challenges: Challenge[]
}

/** How many more squares until the closest single line completes. */
function squaresToNextLine(marked: Set<number>, gridSize: number): number {
  let best = Infinity
  for (const line of linesFor(gridSize)) {
    const remaining = line.positions.filter((p) => !marked.has(p)).length
    if (remaining > 0 && remaining < best) best = remaining
  }
  return best === Infinity ? 0 : best
}

export function BingoBoard({
  card,
  groupId,
  playerCardId: initialPlayerCardId,
  completions = {},
}: {
  card: BingoBoardCard
  groupId: string
  playerCardId?: string
  /** Per-challenge completion counts + who (load-time snapshot). */
  completions?: ChallengeCompletions
}) {
  const [playerCardId, setPlayerCardId] = useState<string | null>(
    initialPlayerCardId ?? null
  )
  const [cells, setCells] = useState<GridCell[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useViewMode("play-board-view", "grid")

  const freePos = card.free_space ? freeSpacePosition(card.grid_size) : null

  const challengeText = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of card.challenges) map.set(c.id, c.text)
    return map
  }, [card.challenges])

  // Load this player's cells from the browser client (RLS scopes to the owner).
  const loadCells = useCallback(
    async (pcId: string) => {
      const supabase = createClient()
      const { data, error: cellsError } = await supabase
        .from("player_card_cells")
        .select("position, challenge_id, is_marked")
        .eq("player_card_id", pcId)
        .order("position", { ascending: true })

      if (cellsError) {
        setError(cellsError.message)
        return
      }

      const mapped: GridCell[] = (data ?? []).map((row) => ({
        position: row.position,
        challengeId: row.challenge_id,
        text: row.challenge_id ? challengeText.get(row.challenge_id) ?? "" : null,
        isMarked: row.is_marked,
      }))
      setCells(mapped)
    },
    [challengeText]
  )

  // Ensure the player card exists, then load cells.
  useEffect(() => {
    let cancelled = false

    async function ensure() {
      let pcId = playerCardId
      if (!pcId) {
        const res = await getOrCreatePlayerCard({ cardId: card.id })
        if (!res.ok) {
          if (!cancelled) {
            setError(res.error)
            toast.error(res.error)
          }
          return
        }
        pcId = res.data.playerCardId
        if (cancelled) return
        setPlayerCardId(pcId)
      }
      if (!cancelled) await loadCells(pcId)
    }

    void ensure()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const [markedCount, setMarkedCount] = useState(0)

  const toLine = useMemo(() => {
    if (!cells) return 0
    const marked = new Set(cells.filter((c) => c.isMarked).map((c) => c.position))
    return squaresToNextLine(marked, card.grid_size)
  }, [cells, card.grid_size])

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
        Couldn&apos;t load your card. {error}
      </div>
    )
  }

  if (!playerCardId || !cells) {
    return <BoardSkeleton gridSize={card.grid_size} />
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className="flex justify-end">
        <ViewToggle value={view} onChange={setView} size="sm" />
      </div>
      <BingoGrid
        playerCardId={playerCardId}
        cardId={card.id}
        gridSize={card.grid_size}
        freeSpacePosition={freePos}
        cells={cells}
        onMarkedCountChange={setMarkedCount}
        view={view}
        completions={completions}
      />
      <p className="text-center text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{markedCount}</span> marked
        {toLine > 0 ? (
          <>
            {" · "}
            <span className="font-semibold text-foreground">{toLine}</span> to a line
          </>
        ) : (
          <span className="text-primary"> · line complete!</span>
        )}
      </p>
    </div>
  )
}

function BoardSkeleton({ gridSize }: { gridSize: number }) {
  const cols: Record<number, string> = {
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className={`grid gap-1.5 sm:gap-2 ${cols[gridSize] ?? "grid-cols-5"}`}>
        {Array.from({ length: gridSize * gridSize }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
      <Skeleton className="mx-auto h-4 w-40" />
    </div>
  )
}
