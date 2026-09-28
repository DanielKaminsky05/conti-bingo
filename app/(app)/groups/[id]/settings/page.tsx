import { notFound } from "next/navigation"
import { getGroup } from "@/lib/queries/groups"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { GroupSettingsForm } from "@/components/settings/group-settings-form"

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const role = await getMyRole(id)
  if (!isHost(role)) notFound()

  let group
  try {
    group = await getGroup(id)
  } catch {
    notFound()
  }

  return <GroupSettingsForm group={group} role={role} />
}
