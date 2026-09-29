import { LayoutGridIcon, ArchiveIcon } from "lucide-react"
import { getActiveCard, listArchivedCards } from "@/lib/queries/cards"
import { EmptyState } from "@/components/common/empty-state"
import { CardListItem } from "@/components/cards/card-list-item"

// Read-only card browsing for everyone. Authoring/publishing lives in Manage.
export default async function CardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [active, archived] = await Promise.all([
    getActiveCard(id),
    listArchivedCards(id),
  ])

  return (
    <div className="space-y-8">
      <h2 className="font-heading text-lg font-semibold">Cards</h2>

      {/* Active */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Active</h3>
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
            description="The host hasn't published a bingo card yet. Check back soon."
          />
        )}
      </section>

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
