"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreVerticalIcon,
  ShieldIcon,
  ShieldOffIcon,
  UserMinusIcon,
  CrownIcon,
  LogOutIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  updateMemberRole,
  removeMember,
  leaveGroup,
  transferOwnership,
} from "@/lib/actions/groups"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { publicStorageUrl } from "@/lib/storage-url"
import { cn } from "@/lib/utils"
import type { MemberWithProfile } from "@/lib/queries/groups"
import type { Enums } from "@/lib/supabase/database.types"

type Role = Enums<"member_role">

const roleBadge: Record<Role, { label: string; variant: "default" | "secondary" | "outline" }> = {
  owner: { label: "Owner", variant: "default" },
  admin: { label: "Admin", variant: "secondary" },
  member: { label: "Member", variant: "outline" },
}

function displayName(m: MemberWithProfile): string {
  return m.nickname || m.profile?.name || m.profile?.username || "Member"
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

export function MemberList({
  members,
  role,
  currentUserId,
  groupId,
  manage = false,
}: {
  members: MemberWithProfile[]
  role: Role | null
  currentUserId: string | null
  groupId: string
  /** Show host management actions (promote/demote/remove/transfer). When false
      (the read-only roster tab) only the viewer's own "Leave group" is offered. */
  manage?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const isOwner = role === "owner"
  const isAdmin = role === "admin"
  const isHost = isOwner || isAdmin

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.")
        return
      }
      toast.success(success)
      router.refresh()
    })
  }

  function promote(userId: string) {
    run(() => updateMemberRole({ groupId, userId, role: "admin" }), "Promoted to admin.")
  }
  function demote(userId: string) {
    run(() => updateMemberRole({ groupId, userId, role: "member" }), "Changed to member.")
  }
  function kick(userId: string, name: string) {
    run(() => removeMember({ groupId, userId }), `Removed ${name}.`)
  }
  function leave() {
    run(() => leaveGroup({ groupId }), "You left the group.")
  }
  function transfer(userId: string, name: string) {
    run(() => transferOwnership({ groupId, newOwnerId: userId }), `${name} is now the owner.`)
  }

  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const name = displayName(m)
        const avatarUrl = publicStorageUrl("avatars", m.profile?.avatar_path)
        const badge = roleBadge[m.role]
        const isSelf = m.user_id === currentUserId
        const targetIsOwner = m.role === "owner"

        // What can the current viewer do to THIS member? Host actions only in
        // the Manage view; the read-only roster offers just self "Leave group".
        const canPromote = manage && isOwner && m.role === "member"
        const canDemote = manage && isOwner && m.role === "admin"
        // Owner can remove admins/members; admin can remove only members. Never the owner.
        const canRemove =
          manage &&
          !targetIsOwner &&
          !isSelf &&
          (isOwner || (isAdmin && m.role === "member"))
        const canTransfer = manage && isOwner && !isSelf && !targetIsOwner

        const hasMenu =
          isSelf || (isHost && (canPromote || canDemote || canRemove || canTransfer))

        return (
          <li
            key={m.user_id}
            className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
          >
            <Avatar>
              {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
              <AvatarFallback>{initials(name) || "?"}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{name}</span>
                {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
              </div>
              {m.profile?.username && (
                <p className="truncate text-xs text-muted-foreground">@{m.profile.username}</p>
              )}
            </div>

            <Badge variant={badge.variant}>{badge.label}</Badge>

            {hasMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" disabled={pending}>
                      <MoreVerticalIcon />
                      <span className="sr-only">Member actions</span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {canPromote && (
                    <DropdownMenuItem onClick={() => promote(m.user_id)}>
                      <ShieldIcon />
                      Make admin
                    </DropdownMenuItem>
                  )}
                  {canDemote && (
                    <DropdownMenuItem onClick={() => demote(m.user_id)}>
                      <ShieldOffIcon />
                      Change to member
                    </DropdownMenuItem>
                  )}

                  {canTransfer && (
                    <TransferOwnershipDialog
                      name={name}
                      pending={pending}
                      onConfirm={() => transfer(m.user_id, name)}
                    />
                  )}

                  {canRemove && (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => kick(m.user_id, name)}
                    >
                      <UserMinusIcon />
                      Remove from group
                    </DropdownMenuItem>
                  )}

                  {isSelf && (
                    <>
                      {(canPromote || canDemote || canRemove || canTransfer) && (
                        <DropdownMenuSeparator />
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (targetIsOwner) {
                            toast.error("Transfer ownership before leaving the group.")
                            return
                          }
                          leave()
                        }}
                      >
                        <LogOutIcon />
                        Leave group
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TransferOwnershipDialog({
  name,
  pending,
  onConfirm,
}: {
  name: string
  pending: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <DropdownMenuItem
            // Keep the menu item from closing the menu before the dialog opens.
            closeOnClick={false}
            className={cn("cursor-default")}
          >
            <CrownIcon />
            Transfer ownership
          </DropdownMenuItem>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership?</DialogTitle>
          <DialogDescription>
            {name} will become the group owner and you will become an admin. This can only be
            undone by the new owner.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            <CrownIcon />
            Transfer ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
