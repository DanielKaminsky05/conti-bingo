import Link from "next/link"
import { PlusIcon, LayoutGridIcon, FileEditIcon, PencilIcon } from "lucide-react"
import { getActiveCard, listDraftCards } from "@/lib/queries/cards"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/common/empty-state"
import { CardListItem } from "@/components/cards/card-list-item"
import { CardAdminActions } from "@/components/cards/card-admin-actions"
import { cn } from "@/lib/utils"

export default async function ManageCardsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [active, drafts] = await Promise.all([getActiveCard(id), listDraftCards(id)])
  const manageBase = `/groups/${id}/manage/cards`

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-semibold">Cards</h3>
        <Link href={`${manageBase}/new`} className={cn(buttonVariants({ variant: "default" }))}>
          <PlusIcon />
          New card
        </Link>
      </div>

      {/* Active */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">Active</h4>
          {active && (
            <Link
              href={`${manageBase}/${active.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <PencilIcon />
              Edit
            </Link>
          )}
        </div>
        {active ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <CardListItem
                groupId={id}
                card={active}
                challengeCount={active.challenges?.length}
                href={`/groups/${id}/cards/${active.id}`}
              />
            </div>
            <CardAdminActions cardId={active.id} title={active.title} canArchive />
          </div>
        ) : (
          <EmptyState icon={<LayoutGridIcon />} title="No active card" />
        )}
      </section>

      {/* Drafts */}
      <section className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Drafts</h4>
        {drafts.length > 0 ? (
          <div className="space-y-2">
            {drafts.map((card) => (
              <div key={card.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CardListItem
                    groupId={id}
                    card={card}
                    href={`${manageBase}/${card.id}`}
                  />
                </div>
                <CardAdminActions cardId={card.id} title={card.title} canArchive={false} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileEditIcon />}
            title="No drafts"
            action={
              <Link
                href={`${manageBase}/new`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <PlusIcon />
                New card
              </Link>
            }
          />
        )}
      </section>
    </div>
  )
}
