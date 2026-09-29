import Link from "next/link"
import { getActiveCard } from "@/lib/queries/cards"
import {
  getChallengeCompletions,
  type ChallengeCompletions,
} from "@/lib/queries/play"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { EmptyState } from "@/components/common/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BingoBoard } from "@/components/bingo/bingo-board"

export default async function GroupPlayPage({
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
    const role = await getMyRole(id)
    if (isHost(role)) {
      return (
        <EmptyState
          title="No active card yet"
          description="Create a bingo card to kick off the game for your group."
          action={
            <Link
              href={`/groups/${id}/manage/cards/new`}
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Create a card
            </Link>
          }
        />
      )
    }
    return (
      <EmptyState
        title="Waiting for a card"
        description="A host hasn't started a game yet. Check back soon!"
      />
    )
  }

  // Per-challenge completion counts (best-effort — never blocks the board).
  // Load-time snapshot; live updates are a follow-up.
  let completions: ChallengeCompletions = {}
  try {
    completions = await getChallengeCompletions(card.id)
  } catch {
    completions = {}
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 font-heading text-lg font-semibold">{card.title}</h2>
        {card.description && (
          <p className="mb-3 text-sm text-muted-foreground">{card.description}</p>
        )}
        <BingoBoard
          card={{
            id: card.id,
            grid_size: card.grid_size,
            free_space: card.free_space,
            layout_mode: card.layout_mode,
            challenges: card.challenges.map((c) => ({ id: c.id, text: c.text })),
          }}
          groupId={id}
          completions={completions}
        />
      </section>
    </div>
  )
}
