import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  Grid3x3Icon,
  LayersIcon,
  SparklesIcon,
  TrophyIcon,
  CalendarIcon,
  RefreshCwIcon,
} from "lucide-react"
import { getCard } from "@/lib/queries/cards"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { CardEditor, type CardEditorInitial } from "@/components/cards/card-editor"
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

  // Hosts editing a draft get the full editor.
  if (host && card.status === "draft") {
    const initial: CardEditorInitial = {
      cardId: card.id,
      title: card.title,
      description: card.description,
      gridSize: card.grid_size,
      layoutMode: card.layout_mode,
      freeSpace: card.free_space,
      winCondition: card.win_condition,
      startsAt: card.starts_at,
      endsAt: card.ends_at,
      challenges: challenges.map((c) => ({ text: c.text, points: c.points })),
    }
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
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">Edit draft</h2>
            <Badge variant="secondary">Draft</Badge>
          </div>
        </div>
        <CardEditor groupId={id} mode="edit" initial={initial} showPublish />
      </div>
    )
  }

  // Everyone else (members, or hosts viewing active/archived) sees a read-only view.
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
              href={`/groups/${id}/cards/new`}
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

      {/* Config summary */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ConfigItem
          icon={<Grid3x3Icon />}
          label="Grid"
          value={`${card.grid_size}×${card.grid_size}`}
        />
        <ConfigItem
          icon={<LayersIcon />}
          label="Layout"
          value={card.layout_mode === "shuffled" ? "Shuffled" : "Identical"}
        />
        <ConfigItem
          icon={<SparklesIcon />}
          label="Free space"
          value={card.free_space ? "Yes" : "No"}
        />
        <ConfigItem
          icon={<TrophyIcon />}
          label="Win"
          value={card.win_condition === "line" ? "Line" : "Blackout"}
        />
      </dl>

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
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Challenges ({challenges.length})
        </h3>
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
      </div>
    </div>
  )
}

function ConfigItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  )
}
