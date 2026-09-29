import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/current-user"

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (user) redirect("/")

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-xl font-semibold">Conti-Bingo</h1>
        </div>
        {children}
      </div>
    </div>
  )
}
