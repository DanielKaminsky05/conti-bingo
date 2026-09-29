import { publicStorageUrl } from "@/lib/storage-url"

/**
 * Contents of the free-space tile: an optional background image (with a small
 * corner ★ so it still reads as "free") or the plain centered ★. The parent
 * tile must be `relative` (and ideally rounded) — see TileMedia. Use this in
 * every free-cell render site so they stay consistent.
 */
export function FreeSpaceContent({ imagePath }: { imagePath?: string | null }) {
  const hasImage = !!publicStorageUrl("group-images", imagePath)
  if (!hasImage) {
    return (
      <span className="text-lg" aria-hidden>
        ★
      </span>
    )
  }
  return (
    <>
      <TileMedia imagePath={imagePath} hasText={false} />
      <span
        aria-hidden
        className="absolute right-0.5 top-0.5 z-[1] text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
      >
        ★
      </span>
    </>
  )
}

/**
 * Background image for a bingo tile (square). Fills the tile behind its content;
 * when the tile also has text, a scrim keeps that text legible. The parent must
 * be `relative` and rounded — the image inherits its corner radius. Returns null
 * when there's no image, so callers can render it unconditionally.
 *
 * Square images are stored in the public `group-images` bucket (see
 * uploadChallengeImage in lib/actions/cards.ts).
 */
export function TileMedia({
  imagePath,
  hasText,
}: {
  imagePath: string | null | undefined
  hasText: boolean
}) {
  const url = publicStorageUrl("group-images", imagePath)
  if (!url) return null
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="pointer-events-none absolute inset-0 size-full rounded-[inherit] object-cover"
      />
      {hasText && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/45"
        />
      )}
    </>
  )
}
