"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Grid3x3Icon, TrophyIcon, LayersIcon, UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function GroupNav({
  groupId,
  framed = false,
}: {
  groupId: string
  /** When a group background image is present, render the tabs in a frosted
      panel (matching the header/content) so they stay legible over the image. */
  framed?: boolean
}) {
  const pathname = usePathname()
  const base = `/groups/${groupId}`
  const tabs = [
    { href: base, label: "Play", icon: Grid3x3Icon, exact: true },
    { href: `${base}/leaderboard`, label: "Leaderboard", icon: TrophyIcon },
    { href: `${base}/cards`, label: "Cards", icon: LayersIcon },
    { href: `${base}/members`, label: "Members", icon: UsersIcon },
  ]

  return (
    <nav
      className={cn(
        "flex gap-1",
        framed
          ? "rounded-2xl border border-foreground/10 bg-background/70 px-1.5 shadow-sm backdrop-blur-sm"
          : "border-b"
      )}
    >
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Icon-only, evenly spread on narrow screens; text labels once
              // there's room (>= sm).
              "-mb-px inline-flex flex-1 items-center justify-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-5 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
