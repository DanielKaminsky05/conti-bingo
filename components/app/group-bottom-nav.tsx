"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Grid3x3Icon, TrophyIcon, LayersIcon, UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Bottom icon nav for the installed PWA ("app version"). Hidden in a normal
 * browser tab; shown only under `display-mode: standalone` (the `standalone:`
 * variant). Mirrors GroupNav's player tabs. Host management lives behind the
 * Manage gear in the group header.
 */
export function GroupBottomNav({ groupId }: { groupId: string }) {
  const pathname = usePathname()
  const base = `/groups/${groupId}`
  const items = [
    { href: base, label: "Play", icon: Grid3x3Icon, exact: true },
    { href: `${base}/leaderboard`, label: "Ranks", icon: TrophyIcon },
    { href: `${base}/cards`, label: "Cards", icon: LayersIcon },
    { href: `${base}/members`, label: "Members", icon: UsersIcon },
  ]

  return (
    <nav
      aria-label="Group"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-border bg-background/95 backdrop-blur standalone:block"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-3xl">
        {items.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname.startsWith(t.href)
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
