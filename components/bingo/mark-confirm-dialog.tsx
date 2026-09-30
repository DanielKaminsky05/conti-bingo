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
 * Confirmation shown before marking (completing) a square, so a stray tap can't
 * accidentally claim one. Shows the challenge's image and/or text. Unmarking
 * doesn't route through here — only completing does.
 */
export function MarkConfirmDialog({
  open,
  onOpenChange,
  text,
  imagePath,
  onConfirm,
  pending = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string | null
  imagePath: string | null | undefined
  onConfirm: () => void
  pending?: boolean
}) {
  const url = publicStorageUrl("group-images", imagePath)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark this square?</DialogTitle>
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
          {text && <p className="text-base font-medium text-balance">{text}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending} onClick={onConfirm}>
            Mark it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
