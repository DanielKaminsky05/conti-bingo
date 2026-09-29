import { redirect } from "next/navigation"

// Group settings moved into the Manage hub. Keep this path working for old links.
export default async function GroupSettingsRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/groups/${id}/manage/group`)
}
