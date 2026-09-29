import { Skeleton } from "@/components/ui/skeleton"

/**
 * Instant fallback shown while any group tab's Server Component fetches its
 * data. The group shell (header + nav in layout.tsx) stays put; only this
 * content slot swaps, so a tab tap feels immediate instead of frozen. A
 * list-of-rows shape suits Leaderboard/Cards/Members; Play's client board
 * renders its own grid skeleton once mounted.
 */
export default function GroupTabLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
