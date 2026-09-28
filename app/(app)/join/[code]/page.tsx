import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { JoinConfirm } from "./join-confirm"

export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const displayCode = decodeURIComponent(code).trim().toUpperCase()

  return (
    <div className="mx-auto max-w-sm py-8">
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 text-center ring-1 ring-foreground/10">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Join a group</h1>
          <p className="text-sm text-muted-foreground">
            Join with code{" "}
            <span className="font-mono font-semibold tracking-wide text-foreground">{displayCode}</span>?
          </p>
        </div>
        <JoinConfirm code={displayCode} />
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mx-auto")}
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
