import { getGroup, listMembers } from "@/lib/queries/groups"
import { listInvites } from "@/lib/queries/invites"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { getCurrentUser } from "@/lib/auth/current-user"
import { MemberList } from "@/components/members/member-list"
import { ShareJoinCode } from "@/components/members/share-join-code"
import { InvitePanel } from "@/components/members/invite-panel"

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

  const host = isHost(role)

  // Host-only reads. Best-effort — never block the roster.
  let joinCode: string | null = null
  let invites: Awaited<ReturnType<typeof listInvites>> = []
  if (host) {
    const [groupResult, invitesResult] = await Promise.allSettled([
      getGroup(id),
      listInvites(id),
    ])
    if (groupResult.status === "fulfilled") joinCode = groupResult.value.join_code
    if (invitesResult.status === "fulfilled") invites = invitesResult.value
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Members</h2>
        <MemberList
          members={members}
          role={role}
          currentUserId={user?.id ?? null}
          groupId={id}
        />
      </section>

      {host && (
        <>
          {joinCode && (
            <section className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">Join code</h2>
              <ShareJoinCode groupId={id} code={joinCode} />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">Invites</h2>
            <InvitePanel groupId={id} invites={invites} />
          </section>
        </>
      )}
    </div>
  )
}
