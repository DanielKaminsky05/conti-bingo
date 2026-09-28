import Link from "next/link"
import { PlusIcon, LayoutGridIcon, FileEditIcon, ArchiveIcon, RefreshCwIcon } from "lucide-react"
import { getActiveCard, listArchivedCards, listDraftCards } from "@/lib/queries/cards"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/common/empty-state"
import { CardListItem } from "@/components/cards/card-list-item"
import { cn } from "@/lib/utils"

export default async function CardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const host = isHost(await getMyRole(id))

  const [active, drafts, archived] = await Promise.all([
    getActiveCard(id),
    host ? listDraftCards(id) : Promise.resolve([]),
    listArchivedCards(id),
  ])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">Cards</h2>
        {host && (
          <Link
            href={`/groups/${id}/cards/new`}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <PlusIcon />
            New card
          </Link>
        )}
      </div>

      {/* Active */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Active</h3>
          {host && active && (
            <Link
              href={`/groups/${id}/cards/${active.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <RefreshCwIcon />
              Replace
            </Link>
          )}
        </div>
        {active ? (
          <CardListItem
            groupId={id}
            card={active}
            challengeCount={active.challenges?.length}
          />
        ) : (
          <EmptyState
            icon={<LayoutGridIcon />}
            title="No active card"
            description={
              host
                ? "Publish a draft to make it the group's live bingo card."
                : "The host hasn't published a bingo card yet. Check back soon."
            }
          />
        )}
      </section>

      {/* Drafts (host only) */}
      {host && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Drafts</h3>
          {drafts.length > 0 ? (
            <div className="space-y-2">
              {drafts.map((card) => (
                <CardListItem key={card.id} groupId={id} card={card} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileEditIcon />}
              title="No drafts"
              description="Start a new card to sketch out challenges before publishing."
              action={
                <Link
                  href={`/groups/${id}/cards/new`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <PlusIcon />
                  New card
                </Link>
              }
            />
          )}
        </section>
      )}

      {/* Archived */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Archived</h3>
        {archived.length > 0 ? (
          <div className="space-y-2">
            {archived.map((card) => (
              <CardListItem key={card.id} groupId={id} card={card} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ArchiveIcon />}
            title="No archived cards"
            description="Past cards land here once a new one is published."
          />
        )}
      </section>
    </div>
  )
}
