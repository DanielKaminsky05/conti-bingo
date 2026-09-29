import { publicStorageUrl } from "@/lib/storage-url"

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
