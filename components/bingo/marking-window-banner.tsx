import { ClockIcon, LockIcon } from "lucide-react"
import { LocalDateTime } from "@/components/common/local-datetime"

/**
 * Banner shown on a board when the card is outside its schedule window:
 * `upcoming` (before starts_at) or `ended` (after ends_at). Marking is closed
 * for players; hosts get a note that they can still mark.
 */
export function MarkingWindowBanner({
  kind,
  iso,
  isHost,
}: {
  kind: "upcoming" | "ended"
  iso: string
  isHost: boolean
}) {
  const upcoming = kind === "upcoming"
  const Icon = upcoming ? ClockIcon : LockIcon

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">
          {upcoming ? (
            <>Starts <LocalDateTime iso={iso} />.</>
          ) : (
            <>This card ended <LocalDateTime iso={iso} />.</>
          )}
        </p>
        <p className="text-muted-foreground">
          {upcoming
            ? isHost
              ? "Marking opens then — as a host you can mark now to set up."
              : "Marking opens then."
            : isHost
              ? "Marking is closed for players — as a host you can still mark, then archive the card."
              : "Marking is closed."}
        </p>
      </div>
    </div>
  )
}
