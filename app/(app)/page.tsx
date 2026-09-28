import { UsersRoundIcon } from "lucide-react"
import { listMyGroups } from "@/lib/queries/groups"
import type { Tables } from "@/lib/supabase/database.types"
import { GroupCard } from "@/components/app/group-card"
import { CreateGroupDialog } from "@/components/app/create-group-dialog"
import { JoinGroupDialog } from "@/components/app/join-group-dialog"
import { EmptyState } from "@/components/common/empty-state"

export default async function DashboardPage() {
  let groups: Tables<"groups">[] = []
  try {
    groups = await listMyGroups()
  } catch {
    groups = []
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">Your groups</h1>
        <div className="flex items-center gap-2">
          <JoinGroupDialog />
          <CreateGroupDialog />
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          icon={<UsersRoundIcon />}
          title="No groups yet"
          description="Create your first bingo group or join one with a code."
          action={
            <div className="flex items-center gap-2">
              <CreateGroupDialog />
              <JoinGroupDialog />
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
