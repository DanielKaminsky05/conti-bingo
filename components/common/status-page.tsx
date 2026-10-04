import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Tile = { letter: string; tone: "marked" | "gold" | "blank" }

const TONE: Record<Tile["tone"], string> = {
  marked: "border-transparent bg-marked text-marked-foreground",
  gold: "border-transparent bg-gold text-white",
  blank: "border-tile-border bg-card text-foreground",
}

/**
 * Full-page status screen (404 / error boundary). Wordle-style tile row spells a
 * short word, then a heading, copy and actions. Purely presentational — safe to
 * render from both Server (not-found) and Client (error) boundaries.
 */
export function StatusPage({
  tiles,
  title,
  description,
  actions,
  footer,
}: {
  tiles: Tile[]
  title: string
  description: string
  actions: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex gap-1.5" aria-hidden>
          {tiles.map((tile, i) => (
            <span
              key={i}
              className={cn(
                "flex size-12 items-center justify-center rounded-xl border-2 font-heading text-xl font-bold uppercase",
                TONE[tile.tone]
              )}
            >
              {tile.letter}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
          {actions}
        </div>
        {footer}
      </div>
    </main>
  )
}
