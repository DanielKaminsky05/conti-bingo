"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { subscribeToNotifications } from "@/lib/realtime/notifications"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

async function fetchUnread(
  client: ReturnType<typeof createClient>,
  userId: string
): Promise<number | null> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
  return error ? null : (count ?? 0)
}

/**
 * N3 — Header bell with a live unread badge. Seeded from the server count, then
 * re-counted (RLS-scoped head query) on every insert/update to the caller's
 * notifications, on navigation, and when the tab regains focus. DELETE events
 * aren't filterable in Realtime, so retracted notifications (revoked bingo,
 * withdrawn invite) are picked up by the navigation/focus recounts.
 */
export function NotificationBell({
  userId,
  initialUnread,
}: {
  userId: string
  initialUnread: number
}) {
  const pathname = usePathname()
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    let cancelled = false
    const client = createClient()
    const recount = () => {
      void fetchUnread(client, userId).then((n) => {
        if (!cancelled && n !== null) setUnread(n)
      })
    }

    recount() // also re-runs on navigation (pathname dep)
    const channel = subscribeToNotifications(client, userId, recount)
    const onVisible = () => {
      if (document.visibilityState === "visible") recount()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      client.removeChannel(channel)
    }
  }, [userId, pathname])

  const label = unread > 0 ? `Notifications (${unread} unread)` : "Notifications"

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
    >
      <BellIcon />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}
