"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { TicketIcon } from "lucide-react"
import { toast } from "sonner"
import { joinGroup } from "@/lib/actions/groups"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"

export function JoinGroupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const joinCode = String(fd.get("joinCode") ?? "").trim()
    setError(null)
    start(async () => {
      const res = await joinGroup({ joinCode })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success("Joined the group.")
      setOpen(false)
      router.push(`/groups/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button variant="outline">
              <TicketIcon />
              Join with code
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
          <DialogDescription>Enter the join code someone shared with you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code">Join code</Label>
            <Input
              id="join-code"
              name="joinCode"
              required
              autoFocus
              autoCapitalize="characters"
              className="uppercase"
              placeholder="ABCD12"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <SubmitButton type="submit" pending={pending}>
              Join group
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
