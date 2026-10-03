import { LockIcon } from "lucide-react"
import { LocalDateTime } from "@/components/common/local-datetime"

/**
 * Shown on a board whose card's end time has passed. Marking is closed for
 * players; hosts get a note that they can still mark (to finish up / correct
 * before archiving).
 */
export function EndedBanner({ endsAt, isHost }: { endsAt: string; isHost: boolean }) {
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
      <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">This card ended <LocalDateTime iso={endsAt} />.</p>
        <p className="text-muted-foreground">
          {isHost
            ? "Marking is closed for players — as a host you can still mark squares, then archive the card."
            : "Marking is closed."}
        </p>
      </div>
    </div>
  )
}
