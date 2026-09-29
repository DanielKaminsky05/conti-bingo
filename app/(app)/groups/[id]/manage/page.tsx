import { redirect } from "next/navigation"

export default async function ManageIndex({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/groups/${id}/manage/cards`)
}
