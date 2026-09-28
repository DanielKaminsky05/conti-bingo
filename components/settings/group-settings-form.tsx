"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  archiveGroup,
  deleteGroup,
  updateGroup,
  uploadGroupImage,
} from "@/lib/actions/groups"
import type { Tables, Enums } from "@/lib/supabase/database.types"
import { publicStorageUrl } from "@/lib/storage-url"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

type Group = Tables<"groups">

export function GroupSettingsForm({
  group,
  role,
}: {
  group: Group
  role: Enums<"member_role"> | null
}) {
  const router = useRouter()
  const isOwner = role === "owner"

  return (
    <div className="space-y-4">
      <DetailsSection group={group} router={router} />
      <ImageSection group={group} router={router} />
      <DangerZone group={group} isOwner={isOwner} router={router} />
    </div>
  )
}

type Router = ReturnType<typeof useRouter>

function DetailsSection({ group, router }: { group: Group; router: Router }) {
  const [pending, start] = useTransition()
  const [lockPending, startLock] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get("name") ?? "").trim()
    const description = String(fd.get("description") ?? "").trim()
    start(async () => {
      const res = await updateGroup({
        groupId: group.id,
        name,
        description: description || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Details saved.")
      router.refresh()
    })
  }

  function toggleLock() {
    const next = !group.join_locked
    startLock(async () => {
      const res = await updateGroup({ groupId: group.id, joinLocked: next })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(next ? "Joining is now locked." : "Joining is now open.")
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>Update your group&apos;s name and description.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              defaultValue={group.name}
              placeholder="Friday Night Crew"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              maxLength={200}
              rows={3}
              defaultValue={group.description ?? ""}
              placeholder="What's this group about?"
              className={cn(
                "flex min-h-16 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
              )}
            />
          </div>
          <div className="flex justify-end">
            <SubmitButton type="submit" pending={pending}>
              Save changes
            </SubmitButton>
          </div>
        </form>

        <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">Lock joining</p>
            <p className="text-sm text-muted-foreground">
              When locked, the join code stops working. Existing members stay.
            </p>
          </div>
          <SubmitButton
            type="button"
            variant={group.join_locked ? "default" : "outline"}
            pending={lockPending}
            onClick={toggleLock}
            aria-pressed={group.join_locked}
            className="shrink-0"
          >
            {group.join_locked ? <LockIcon /> : <LockOpenIcon />}
            {group.join_locked ? "Locked" : "Open"}
          </SubmitButton>
        </div>
      </CardContent>
    </Card>
  )
}

function ImageSection({ group, router }: { group: Group; router: Router }) {
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentUrl = publicStorageUrl("group-images", group.image_path)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setSelected(null)
      setPreviewUrl(null)
      return
    }
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image.")
      e.target.value = ""
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5 MB or smaller.")
      e.target.value = ""
      return
    }
    setSelected(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected) {
      toast.error("Choose an image first.")
      return
    }
    const fd = new FormData()
    fd.append("groupId", group.id)
    fd.append("file", selected)
    start(async () => {
      const res = await uploadGroupImage(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Image updated.")
      setSelected(null)
      setPreviewUrl(null)
      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    })
  }

  const shown = previewUrl ?? currentUrl

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group image</CardTitle>
        <CardDescription>PNG or JPG, up to 5 MB.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onUpload} className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt=""
              className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-foreground/10">
              <ImageIcon className="size-7 opacity-70" />
            </div>
          )}
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="group-image">Choose a new image</Label>
              <Input
                id="group-image"
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={onPick}
              />
            </div>
            <div className="flex justify-end">
              <SubmitButton type="submit" pending={pending} disabled={!selected}>
                <UploadIcon />
                Upload
              </SubmitButton>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function DangerZone({
  group,
  isOwner,
  router,
}: {
  group: Group
  isOwner: boolean
  router: Router
}) {
  const [archivePending, startArchive] = useTransition()
  const isArchived = group.status === "archived"

  function toggleArchive() {
    const next = !isArchived
    startArchive(async () => {
      const res = await archiveGroup({ groupId: group.id, archived: next })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(next ? "Group archived." : "Group reactivated.")
      router.refresh()
    })
  }

  return (
    <Card className="ring-0 border border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>These actions affect the whole group.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">
              {isArchived ? "Reactivate group" : "Archive group"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isArchived
                ? "Bring this group back to active status."
                : "Hide the group and pause activity. You can undo this."}
            </p>
          </div>
          <SubmitButton
            type="button"
            variant="outline"
            pending={archivePending}
            onClick={toggleArchive}
            className="shrink-0"
          >
            {isArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {isArchived ? "Reactivate" : "Archive"}
          </SubmitButton>
        </div>

        {isOwner && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">Delete group</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this group and all of its data. This cannot be undone.
              </p>
            </div>
            <DeleteGroupDialog group={group} router={router} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeleteGroupDialog({ group, router }: { group: Group; router: Router }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [pending, start] = useTransition()
  const matches = confirmText.trim() === group.name

  function onDelete() {
    if (!matches) return
    start(async () => {
      const res = await deleteGroup({ groupId: group.id })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Group deleted.")
      setOpen(false)
      router.push("/")
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setConfirmText("")
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" className="shrink-0">
            <Trash2Icon />
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{group.name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the group, its members, cards, and results. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-name">
            Type <span className="font-semibold text-foreground">{group.name}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder={group.name}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <SubmitButton
            type="button"
            variant="destructive"
            pending={pending}
            disabled={!matches}
            onClick={onDelete}
          >
            <Trash2Icon />
            Delete group
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
