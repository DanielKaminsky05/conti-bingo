"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CopyIcon, CheckIcon, Trash2Icon, MailIcon, LinkIcon } from "lucide-react"
import { toast } from "sonner"
import { createInvite, revokeInvite } from "@/lib/actions/invites"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SubmitButton } from "@/components/common/submit-button"
import { EmptyState } from "@/components/common/empty-state"
import { cn } from "@/lib/utils"
import type { Tables } from "@/lib/supabase/database.types"

type Invite = Tables<"invites">
type InviteRole = "member" | "admin"

function invitePath(token: string): string {
  return `/invite/${token}`
}

function absoluteLink(path: string): string {
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Never expires"
  const d = new Date(expiresAt)
  if (d.getTime() < Date.now()) return "Expired"
  return `Expires ${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`
}

export function InvitePanel({
  groupId,
  invites,
}: {
  groupId: string
  invites: Invite[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [revoking, startRevoke] = useTransition()

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<InviteRole>("member")
  const [expiryHours, setExpiryHours] = useState("")
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Locale/timezone date formatting differs server vs client — only format after
  // mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const pendingInvites = invites.filter((i) => i.status === "pending")

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const trimmedEmail = email.trim()
      const hours = expiryHours.trim() ? Number(expiryHours.trim()) : undefined
      if (hours !== undefined && (!Number.isFinite(hours) || hours <= 0)) {
        toast.error("Expiry must be a positive number of hours.")
        return
      }

      const res = await createInvite({
        groupId,
        email: trimmedEmail ? trimmedEmail : undefined,
        role,
        expiresInHours: hours,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }

      setEmail("")
      setExpiryHours("")
      setRole("member")
      setCopied(false)
      setNewLink(absoluteLink(invitePath(res.data.token)))
      toast.success("Invite created.")
      router.refresh()
    })
  }

  async function copyNewLink() {
    if (!newLink) return
    try {
      await navigator.clipboard.writeText(newLink)
      setCopied(true)
      toast.success("Invite link copied.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy. Copy the link manually.")
    }
  }

  function revoke(inviteId: string) {
    startRevoke(async () => {
      const res = await revokeInvite({ inviteId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Invite revoked.")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as InviteRole)}
                  disabled={pending}
                  className={cn(
                    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    "disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
                  )}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5 sm:max-w-[50%]">
              <Label htmlFor="invite-expiry">Expires in (hours, optional)</Label>
              <Input
                id="invite-expiry"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Default 168 (7 days)"
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
                disabled={pending}
              />
            </div>

            <SubmitButton type="submit" pending={pending}>
              <MailIcon />
              Create invite
            </SubmitButton>
          </form>

          {newLink && (
            <div className="mt-4 space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LinkIcon className="size-3.5" />
                Share this invite link
              </p>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1.5 text-sm">
                  {newLink}
                </div>
                <Button variant="outline" size="sm" onClick={copyNewLink} type="button">
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Pending invites {pendingInvites.length > 0 && `(${pendingInvites.length})`}
        </h3>

        {pendingInvites.length === 0 ? (
          <EmptyState
            icon={<MailIcon />}
            title="No pending invites"
            description="Create an invite above to share access with a specific person or role."
          />
        ) : (
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {invite.email ?? "Link invite"}
                    </span>
                    <Badge variant={invite.role === "admin" ? "secondary" : "outline"}>
                      {invite.role === "admin" ? "Admin" : "Member"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mounted
                      ? formatExpiry(invite.expires_at)
                      : invite.expires_at
                        ? "Expiring…"
                        : "Never expires"}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => revoke(invite.id)}
                  disabled={revoking}
                >
                  <Trash2Icon />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
