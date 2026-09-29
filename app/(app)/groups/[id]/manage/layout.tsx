import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { ManageNav } from "@/components/app/manage-nav"

// Host-only hub. Non-hosts are bounced back to the group; the read tabs
// (Play/Leaderboard/Cards/Members) remain available to everyone.
export default async function ManageLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const role = await getMyRole(id)
  if (!isHost(role)) redirect(`/groups/${id}`)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">Manage</h2>
        <p className="text-sm text-muted-foreground">Host tools for this group.</p>
      </div>
      <ManageNav groupId={id} />
      <div>{children}</div>
    </div>
  )
}
