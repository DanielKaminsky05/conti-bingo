import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, CalendarIcon, RefreshCwIcon } from "lucide-react"
import { getCard } from "@/lib/queries/cards"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { CardChallengesView } from "@/components/cards/card-challenges-view"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>
}) {
  const { id, cardId } = await params

  let card
  try {
    card = await getCard(cardId)
  } catch {
    notFound()
  }

  const host = isHost(await getMyRole(id))
  const challenges = card.challenges ?? []

  // Read-only card view for everyone. Draft editing lives in Manage → Cards.
  const statusVariant =
    card.status === "active" ? "default" : card.status === "draft" ? "secondary" : "outline"
  const start = formatDateTime(card.starts_at)
  const end = formatDateTime(card.ends_at)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${id}/cards`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
        >
          <ArrowLeftIcon />
          Cards
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">{card.title}</h2>
            <Badge variant={statusVariant}>
              {card.status.charAt(0).toUpperCase() + card.status.slice(1)}
            </Badge>
          </div>
          {host && card.status === "active" && (
            <Link
              href={`/groups/${id}/manage/cards/new`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <RefreshCwIcon />
              Replace
            </Link>
          )}
        </div>
        {card.description && (
          <p className="text-sm text-muted-foreground">{card.description}</p>
        )}
      </div>

      {/* Layout + win, blended into the page (grid size / free space are obvious
          from the board below). */}
      <p className="text-sm text-muted-foreground">
        {card.layout_mode === "shuffled" ? "Shuffled" : "Identical"} ·{" "}
        {card.win_condition === "line" ? "Line to win" : "Blackout to win"}
      </p>

      {(start || end) && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <CalendarIcon className="size-4 text-muted-foreground" />
          {start && (
            <span>
              <span className="text-muted-foreground">Starts </span>
              {start}
            </span>
          )}
          {end && (
            <span>
              <span className="text-muted-foreground">Ends </span>
              {end}
            </span>
          )}
        </div>
      )}

      {/* Challenges */}
      <CardChallengesView
        challenges={challenges.map((c) => ({
          id: c.id,
          text: c.text,
          points: c.points,
          imagePath: c.image_path,
        }))}
        gridSize={card.grid_size}
        freeSpace={card.free_space}
        freeSpaceImagePath={card.free_space_image_path}
      />
    </div>
  )
}
