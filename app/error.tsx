"use client" // Error boundaries must be Client Components

import { useEffect } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusPage } from "@/components/common/status-page"

/**
 * Root error boundary for unexpected runtime errors (queries throw by design).
 * In production, Server Component errors arrive with a generic message plus a
 * `digest` that matches the server logs — show the digest, never the message.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusPage
      tiles={[
        { letter: "o", tone: "blank" },
        { letter: "o", tone: "gold" },
        { letter: "p", tone: "blank" },
        { letter: "s", tone: "marked" },
      ]}
      title="Something went wrong"
      description="We couldn't load this page. It's probably temporary — try again in a moment."
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to my groups
          </Link>
        </>
      }
      footer={
        error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
        ) : null
      }
    />
  )
}
