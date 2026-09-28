import { EmptyState } from "@/components/common/empty-state"

// Placeholder — replaced by the real dashboard in Phase 2.
export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Your groups</h1>
      <EmptyState title="Dashboard coming up" description="The groups list lands in the next build phase." />
    </div>
  )
}
