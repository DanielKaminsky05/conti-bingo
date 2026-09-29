import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/current-user"

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // /reset-password is reached WITH a session (the recovery link established one
  // via /auth/callback), so it must not be bounced away by the signed-in guard.
  const pathname = (await headers()).get("x-pathname") ?? ""
  const isRecovery = pathname.startsWith("/reset-password")

  const user = await getCurrentUser()
  if (user && !isRecovery) redirect("/")

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-xl font-semibold">Contibingo</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
