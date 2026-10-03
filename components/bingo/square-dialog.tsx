"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { publicStorageUrl } from "@/lib/storage-url"

/**
 * Shows a square's full challenge (image and/or untruncated text) when a tile is
 * tapped — so long challenges are always readable even though the grid tile
 * clamps them. When marking is allowed, an action button (Mark / Unmark) is
 * shown; otherwise it's a read-only view with an optional note (e.g. "Marking is
 * closed."). This also serves as the confirm-before-marking step.
 */
export function SquareDialog({
  open,
  onOpenChange,
  title,
  text,
  imagePath,
  action,
  note,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  text: string | null
  imagePath: string | null | undefined
  action?: { label: string; onConfirm: () => void }
  note?: string | null
}) {
  const url = publicStorageUrl("group-images", imagePath)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 text-center">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="size-40 max-w-full rounded-xl object-cover ring-1 ring-foreground/10"
            />
          )}
          {text ? (
            <p className="text-base font-medium text-balance">{text}</p>
          ) : (
            !url && <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </div>

        {note && <p className="text-center text-sm text-muted-foreground">{note}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {action ? "Cancel" : "Close"}
          </DialogClose>
          {action && <Button onClick={action.onConfirm}>{action.label}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
