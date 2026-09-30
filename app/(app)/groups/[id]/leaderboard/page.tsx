import { getActiveCard } from "@/lib/queries/cards"
import { getLeaderboard } from "@/lib/queries/leaderboard"
import { getCoopProgress, getCoopStandings } from "@/lib/queries/coop"
import { getCurrentUser } from "@/lib/auth/current-user"
import { EmptyState } from "@/components/common/empty-state"
import { Leaderboard, type LeaderboardRow } from "@/components/bingo/leaderboard"
import { CoopStandings } from "@/components/bingo/coop-standings"

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // The active card and the viewer's identity are independent — fetch them
  // together so we pay one round-trip wave, not two serial ones.
  const [card, user] = await Promise.all([
    getActiveCard(id).catch(() => null),
    getCurrentUser(),
  ])

  if (!card) {
    return (
      <EmptyState title="No leaderboard yet" />
    )
  }

  // Co-op mode ranks individual contributions to the shared board.
  if (card.game_mode === "coop") {
    const [progress, standings] = await Promise.all([
      getCoopProgress(card.id).catch(() => null),
      getCoopStandings(card.id).catch(() => []),
    ])
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Contributions</h2>
          <p className="text-sm text-muted-foreground">{card.title}</p>
        </div>
        <CoopStandings
          rows={standings}
          boardId={progress?.boardId ?? null}
          total={progress?.total ?? 0}
          marked={progress?.marked ?? 0}
          completed={!!progress?.completedAt}
          currentUserId={user?.id ?? null}
          card={{
            gridSize: card.grid_size,
            freeSpace: card.free_space,
            freeSpaceImagePath: card.free_space_image_path,
            challenges: card.challenges.map((c) => ({
              id: c.id,
              text: c.text,
              imagePath: c.image_path,
            })),
          }}
        />
      </div>
    )
  }

  let rows: LeaderboardRow[] = []
  try {
    rows = (await getLeaderboard(card.id)) as unknown as LeaderboardRow[]
  } catch {
    rows = []
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">{card.title}</p>
      </div>
      <Leaderboard
        rows={rows}
        cardId={card.id}
        currentUserId={user?.id ?? null}
        card={{
          id: card.id,
          gridSize: card.grid_size,
          freeSpace: card.free_space,
          freeSpaceImagePath: card.free_space_image_path,
          challenges: card.challenges.map((c) => ({
            id: c.id,
            text: c.text,
            imagePath: c.image_path,
          })),
        }}
      />
    </div>
  )
}
