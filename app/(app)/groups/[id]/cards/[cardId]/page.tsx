import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, CalendarIcon, RefreshCwIcon } from "lucide-react"
import { getCard } from "@/lib/queries/cards"
import { getLeaderboard } from "@/lib/queries/leaderboard"
import { getCoopProgress, getCoopStandings } from "@/lib/queries/coop"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { getCurrentUser } from "@/lib/auth/current-user"
import { CardChallengesView } from "@/components/cards/card-challenges-view"
import { Leaderboard, type LeaderboardRow } from "@/components/bingo/leaderboard"
import { CoopStandings } from "@/components/bingo/coop-standings"
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

  // Standings/history: available once a card is live or archived (not drafts).
  // Same data the Leaderboard tab shows, but scoped to THIS card — so archived
  // cards keep a viewable record of who did what.
  const showStandings = card.status !== "draft"
  const isCoop = card.game_mode === "coop"
  const viewer = showStandings ? await getCurrentUser() : null

  const [coopProgress, coopStandings] =
    showStandings && isCoop
      ? await Promise.all([
          getCoopProgress(cardId).catch(() => null),
          getCoopStandings(cardId).catch(() => []),
        ])
      : [null, []]

  const leaderboardRows: LeaderboardRow[] =
    showStandings && !isCoop
      ? ((await getLeaderboard(cardId).catch(() => [])) as unknown as LeaderboardRow[])
      : []

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

      {showStandings && (
        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="font-heading text-base font-semibold">
            {card.status === "archived" ? "Final results" : "Standings"}
          </h3>
          {isCoop ? (
            <CoopStandings
              rows={coopStandings}
              boardId={coopProgress?.boardId ?? null}
              total={coopProgress?.total ?? 0}
              marked={coopProgress?.marked ?? 0}
              completed={!!coopProgress?.completedAt}
              currentUserId={viewer?.id ?? null}
            />
          ) : (
            <Leaderboard
              rows={leaderboardRows}
              cardId={card.id}
              currentUserId={viewer?.id ?? null}
              card={{
                id: card.id,
                gridSize: card.grid_size,
                freeSpace: card.free_space,
                freeSpaceImagePath: card.free_space_image_path,
                challenges: challenges.map((c) => ({
                  id: c.id,
                  text: c.text,
                  imagePath: c.image_path,
                })),
              }}
            />
          )}
        </section>
      )}
    </div>
  )
}
