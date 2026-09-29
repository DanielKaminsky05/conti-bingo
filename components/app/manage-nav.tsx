"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/** Sub-navigation for the host-only Manage hub. */
export function ManageNav({ groupId }: { groupId: string }) {
  const pathname = usePathname()
  const base = `/groups/${groupId}/manage`
  const tabs = [
    { href: `${base}/cards`, label: "Cards" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/group`, label: "Group" },
  ]

  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
