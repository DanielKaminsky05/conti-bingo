import { notFound } from "next/navigation"
import { getGroup } from "@/lib/queries/groups"
import { getMyRole } from "@/lib/queries/membership"
import { GroupSettingsForm } from "@/components/settings/group-settings-form"

// Host gating is enforced by the manage/ layout.
export default async function ManageGroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const role = await getMyRole(id)

  let group
  try {
    group = await getGroup(id)
  } catch {
    notFound()
  }

  return <GroupSettingsForm group={group} role={role} />
}
