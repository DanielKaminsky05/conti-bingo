import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getCurrentProfile } from "@/lib/auth/current-user"
import { AppHeader } from "@/components/app/app-header"
import { countUnreadNotifications } from "@/lib/queries/notifications"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect("/login")
  const unreadNotifications = await countUnreadNotifications()

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader profile={profile} unreadNotifications={unreadNotifications} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
