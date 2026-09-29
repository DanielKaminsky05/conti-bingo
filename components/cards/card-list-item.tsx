import Link from "next/link"
import { Grid3x3Icon, ListChecksIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/supabase/database.types"

type CardStatus = Enums<"card_status">

const statusVariant: Record<CardStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
}

const statusLabel: Record<CardStatus, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
}

export function CardListItem({
  groupId,
  card,
  challengeCount,
  href,
}: {
  groupId: string
  card: {
    id: string
    title: string
    status: CardStatus
    grid_size: number
  }
  challengeCount?: number
  /** Link target; defaults to the read-only card view. */
  href?: string
}) {
  return (
    <Link
      href={href ?? `/groups/${groupId}/cards/${card.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-card-foreground ring-1 ring-foreground/10 transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-heading text-base font-medium">{card.title}</h3>
          <Badge variant={statusVariant[card.status]}>{statusLabel[card.status]}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Grid3x3Icon className="size-3.5" />
            {card.grid_size}×{card.grid_size}
          </span>
          {challengeCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <ListChecksIcon className="size-3.5" />
              {challengeCount} {challengeCount === 1 ? "challenge" : "challenges"}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
