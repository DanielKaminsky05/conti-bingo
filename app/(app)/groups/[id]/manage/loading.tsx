import { Skeleton } from "@/components/ui/skeleton"

/**
 * Fallback for the Manage sub-tabs (Cards / Members / Group). The Manage
 * layout (heading + ManageNav) persists across sub-tab switches; only this
 * content slot swaps, so switching tabs feels instant instead of frozen.
 * A section label + rows suits Cards/Members; the field blocks suit Group.
 */
export default function ManageTabLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  )
}
