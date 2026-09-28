import { getActiveCard } from "@/lib/queries/cards"
import { getLeaderboard } from "@/lib/queries/leaderboard"
import { getCurrentUser } from "@/lib/auth/current-user"
import { EmptyState } from "@/components/common/empty-state"
import { Leaderboard, type LeaderboardRow } from "@/components/bingo/leaderboard"

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let card
  try {
    card = await getActiveCard(id)
  } catch {
    card = null
  }

  if (!card) {
    return (
      <EmptyState
        title="No leaderboard yet"
        description="Standings appear once a host starts an active card."
      />
    )
  }

  let rows: LeaderboardRow[] = []
  try {
    rows = (await getLeaderboard(card.id)) as unknown as LeaderboardRow[]
  } catch {
    rows = []
  }

  const user = await getCurrentUser()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">{card.title}</p>
      </div>
      <Leaderboard rows={rows} cardId={card.id} currentUserId={user?.id ?? null} />
    </div>
  )
}
