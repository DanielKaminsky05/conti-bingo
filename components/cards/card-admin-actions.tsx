"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { archiveCard, deleteCard } from "@/lib/actions/cards"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Host-only Archive / Delete controls for a card in the Manage → Cards list.
 * Archive is offered for the active card (drafts don't need it); Delete for any.
 * Both confirm first — delete is irreversible.
 */
export function CardAdminActions({
  cardId,
  title,
  canArchive,
}: {
  cardId: string
  title: string
  canArchive: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onArchive() {
    start(async () => {
      const res = await archiveCard({ cardId })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Card archived.")
      router.refresh()
    })
  }

  function onDelete() {
    start(async () => {
      const res = await deleteCard({ cardId })
      if (!res.ok) return void toast.error(res.error)
      toast.success("Card deleted.")
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {canArchive && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" disabled={pending} aria-label="Archive card">
              <ArchiveIcon />
            </Button>
          }
          title="Archive this card?"
          description={`"${title}" will stop being the group's live card. Its results stay viewable in the archive.`}
          confirmLabel="Archive"
          onConfirm={onArchive}
          pending={pending}
        />
      )}
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label="Delete card"
            className="text-destructive hover:text-destructive"
          >
            <Trash2Icon />
          </Button>
        }
        title="Delete this card?"
        description={`"${title}" and all of its challenges and results will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
        pending={pending}
      />
    </div>
  )
}

function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  pending,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
