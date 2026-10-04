import type { Metadata } from "next"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { StatusPage } from "@/components/common/status-page"

export const metadata: Metadata = {
  title: "Page not found · Contibingo",
}

/**
 * Root 404 — handles unmatched URLs and any `notFound()` call without a nearer
 * boundary (e.g. a group you're not a member of, or a deleted card).
 */
export default function NotFound() {
  return (
    <StatusPage
      tiles={[
        { letter: "4", tone: "marked" },
        { letter: "0", tone: "gold" },
        { letter: "4", tone: "blank" },
      ]}
      title="That square isn't on the card"
      description="The page you're looking for doesn't exist, or you don't have access to it."
      actions={
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to my groups
        </Link>
      }
    />
  )
}
