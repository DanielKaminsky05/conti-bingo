import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { getActiveCard, getCard } from "@/lib/queries/cards"
import { CardEditor, type CardEditorInitial } from "@/components/cards/card-editor"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Host gating is enforced by the manage/ layout. This edits a DRAFT or the live
// ACTIVE card in place (D5); archived cards are read-only and live under
// /groups/[id]/cards/[cardId].
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

  if (card.status === "archived") {
    redirect(`/groups/${id}/cards/${cardId}`)
  }

  const live = card.status === "active"
  // Publishing a draft archives whatever is live now — warn the host which card.
  const active = live ? null : await getActiveCard(id)
  const challenges = card.challenges ?? []
  const initial: CardEditorInitial = {
    cardId: card.id,
    title: card.title,
    description: card.description,
    gridSize: card.grid_size,
    layoutMode: card.layout_mode,
    freeSpace: card.free_space,
    freeSpaceImagePath: card.free_space_image_path,
    winCondition: card.win_condition,
    gameMode: card.game_mode,
    startsAt: card.starts_at,
    endsAt: card.ends_at,
    challenges: challenges.map((c) => ({
      text: c.text,
      points: c.points,
      imagePath: c.image_path,
    })),
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
          <h3 className="font-heading text-base font-semibold">
            {live ? "Edit live card" : "Edit draft"}
          </h3>
          <Badge variant={live ? "default" : "secondary"}>{live ? "Active" : "Draft"}</Badge>
        </div>
      </div>
      <CardEditor
        groupId={id}
        mode="edit"
        initial={initial}
        live={live}
        showPublish={!live}
        replacingTitle={active?.title}
        returnHref={manageCards}
      />
    </div>
  )
}
