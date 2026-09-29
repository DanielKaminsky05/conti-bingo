import { getGroup, listMembers } from "@/lib/queries/groups"
import { listInvites } from "@/lib/queries/invites"
import { getMyRole } from "@/lib/queries/membership"
import { getCurrentUser } from "@/lib/auth/current-user"
import { MemberList } from "@/components/members/member-list"
import { ShareJoinCode } from "@/components/members/share-join-code"
import { InvitePanel } from "@/components/members/invite-panel"

// Host gating is enforced by the manage/ layout.
export default async function ManageMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [members, role, user, group, invites] = await Promise.all([
    listMembers(id),
    getMyRole(id),
    getCurrentUser(),
    getGroup(id),
    listInvites(id),
  ])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-heading text-base font-semibold">Roster</h3>
        <MemberList
          members={members}
          role={role}
          currentUserId={user?.id ?? null}
          groupId={id}
          manage
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-base font-semibold">Join code</h3>
        <ShareJoinCode groupId={id} code={group.join_code} />
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-base font-semibold">Invites</h3>
        <InvitePanel groupId={id} invites={invites} />
      </section>
    </div>
  )
}
