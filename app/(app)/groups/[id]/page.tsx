import Link from "next/link"
import { getActiveCard } from "@/lib/queries/cards"
import {
  getChallengeCompletions,
  type ChallengeCompletions,
} from "@/lib/queries/play"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { getCurrentUser } from "@/lib/auth/current-user"
import { EmptyState } from "@/components/common/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BingoBoard } from "@/components/bingo/bingo-board"
import { CoopBoard } from "@/components/bingo/coop-board"

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
    return <EmptyState title="Waiting for a card" />
  }

  const challenges = card.challenges.map((c) => ({
    id: c.id,
    text: c.text,
    imagePath: c.image_path,
  }))

  // Co-op: one shared board the whole group fills together (blackout).
  if (card.game_mode === "coop") {
    const [user, role] = await Promise.all([getCurrentUser(), getMyRole(id)])
    return (
      <div className="space-y-6">
        <section>
          <h2 className="mb-1 font-heading text-lg font-semibold">{card.title}</h2>
          {card.description && (
            <p className="mb-3 text-sm text-muted-foreground">{card.description}</p>
          )}
          <CoopBoard
            card={{
              id: card.id,
              grid_size: card.grid_size,
              free_space: card.free_space,
              free_space_image_path: card.free_space_image_path,
              challenges,
            }}
            currentUserId={user?.id ?? null}
            isHost={isHost(role)}
          />
        </section>
      </div>
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
            free_space_image_path: card.free_space_image_path,
            layout_mode: card.layout_mode,
            challenges,
          }}
          groupId={id}
          completions={completions}
        />
      </section>
    </div>
  )
}
