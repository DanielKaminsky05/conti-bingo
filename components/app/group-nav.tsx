"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function GroupNav({ groupId, isHost }: { groupId: string; isHost: boolean }) {
  const pathname = usePathname()
  const base = `/groups/${groupId}`
  const tabs = [
    { href: base, label: "Play", exact: true },
    { href: `${base}/leaderboard`, label: "Leaderboard" },
    { href: `${base}/cards`, label: "Cards" },
    { href: `${base}/members`, label: "Members" },
    ...(isHost ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ]

  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
