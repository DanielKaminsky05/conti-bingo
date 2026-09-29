import { listMembers } from "@/lib/queries/groups"
import { getMyRole } from "@/lib/queries/membership"
import { getCurrentUser } from "@/lib/auth/current-user"
import { MemberList } from "@/components/members/member-list"

// Read-only roster for everyone. Roles, removal, invites, and the join code
// live in Manage → Members (host only).
export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [members, role, user] = await Promise.all([
    listMembers(id),
    getMyRole(id),
    getCurrentUser(),
  ])

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-semibold">Members</h2>
      <MemberList
        members={members}
        role={role}
        currentUserId={user?.id ?? null}
        groupId={id}
      />
    </div>
  )
}
