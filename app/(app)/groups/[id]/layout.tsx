import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { getGroup } from "@/lib/queries/groups"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { GroupNav } from "@/components/app/group-nav"
import { publicStorageUrl } from "@/lib/storage-url"

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let group
  try {
    group = await getGroup(id)
  } catch {
    notFound()
  }
  const role = await getMyRole(id)
  const image = publicStorageUrl("group-images", group.image_path)

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-11 rounded-xl object-cover" />
        ) : (
          <div className="grid size-11 place-items-center rounded-xl bg-secondary font-heading text-lg font-bold text-secondary-foreground">
            {group.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-heading text-xl font-semibold">{group.name}</h1>
          {group.description && (
            <p className="truncate text-sm text-muted-foreground">{group.description}</p>
          )}
        </div>
      </header>
      <GroupNav groupId={id} isHost={isHost(role)} />
      <div>{children}</div>
    </div>
  )
}
