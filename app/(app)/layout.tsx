import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getCurrentProfile } from "@/lib/auth/current-user"
import { AppHeader } from "@/components/app/app-header"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect("/login")

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
