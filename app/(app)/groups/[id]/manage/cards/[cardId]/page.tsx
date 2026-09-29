import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { getCard } from "@/lib/queries/cards"
import { CardEditor, type CardEditorInitial } from "@/components/cards/card-editor"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Host gating is enforced by the manage/ layout. This edits a DRAFT; active or
// archived cards are read-only and live under /groups/[id]/cards/[cardId].
export default async function ManageCardEditPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>
}) {
  const { id, cardId } = await params
  const manageCards = `/groups/${id}/manage/cards`

  let card
  try {
    card = await getCard(cardId)
  } catch {
    notFound()
  }

  if (card.status !== "draft") {
    redirect(`/groups/${id}/cards/${cardId}`)
  }

  const challenges = card.challenges ?? []
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
          href={manageCards}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
        >
          <ArrowLeftIcon />
          Cards
        </Link>
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-base font-semibold">Edit draft</h3>
          <Badge variant="secondary">Draft</Badge>
        </div>
      </div>
      <CardEditor groupId={id} mode="edit" initial={initial} showPublish returnHref={manageCards} />
    </div>
  )
}
