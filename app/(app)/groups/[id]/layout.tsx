import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { getGroup } from "@/lib/queries/groups"
import { getMyRole, isHost } from "@/lib/queries/membership"
import { GroupNav } from "@/components/app/group-nav"
import { GroupBottomNav } from "@/components/app/group-bottom-nav"
import { publicStorageUrl } from "@/lib/storage-url"
import { cn } from "@/lib/utils"

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
  const background = publicStorageUrl("group-images", group.background_path)

  return (
    <div className="relative space-y-4 standalone:pb-20">
      {background && (
        // Full-bleed backdrop behind ALL group pages. Fixed so it fills the
        // viewport regardless of the centered content column; -z-10 keeps it
        // behind the app content. A scrim keeps text/tiles legible in both
        // light and dark mode.
        <div aria-hidden className="pointer-events-none fixed inset-x-0 -top-12 -bottom-12 -z-10 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={background} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-background/30 dark:bg-background/50" />
        </div>
      )}

      <header
        className={cn(
          "flex items-center gap-3",
          background &&
            "rounded-2xl border border-foreground/10 bg-background/70 p-3 shadow-sm backdrop-blur-sm",
        )}
      >
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
      {/* Top tabs in the browser; hidden in the installed app (bottom nav instead). */}
      <div className="standalone:hidden">
        <GroupNav groupId={id} isHost={isHost(role)} framed={!!background} />
      </div>
      <div
        className={cn(
          background &&
            "rounded-2xl border border-foreground/10 bg-background/70 p-3 shadow-sm backdrop-blur-sm sm:p-4",
        )}
      >
        {children}
      </div>
      <GroupBottomNav groupId={id} isHost={isHost(role)} />
    </div>
  )
}
