import Link from "next/link"
import type { Tables, Enums } from "@/lib/supabase/database.types"
import { publicStorageUrl } from "@/lib/storage-url"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Group = Tables<"groups">

const roleLabels: Record<Enums<"member_role">, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

export function GroupCard({ group, role }: { group: Group; role?: Enums<"member_role"> | null }) {
  const image = publicStorageUrl("group-images", group.image_path)

  return (
    <Link
      href={`/groups/${group.id}`}
      className={cn(
        "group/card flex flex-col gap-3 overflow-hidden rounded-2xl bg-card p-3 text-sm text-card-foreground ring-1 ring-foreground/10 transition-all",
        "hover:-translate-y-0.5 hover:ring-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary font-heading text-xl font-bold text-secondary-foreground">
            {group.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-heading text-base font-medium">{group.name}</h3>
            {role && (
              <Badge variant="secondary" className="shrink-0">
                {roleLabels[role]}
              </Badge>
            )}
          </div>
          {group.description && (
            <p className="truncate text-sm text-muted-foreground">{group.description}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
