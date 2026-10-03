"use client"

import { useEffect, useState } from "react"

/**
 * Renders an ISO timestamp in the VIEWER's local timezone. Must be a client
 * component: a server component would format with the server's timezone (UTC on
 * Vercel), so e.g. an 8:20 EDT start stored as 12:20Z would wrongly show as
 * "12:20". We format after mount (in the browser) and keep the raw ISO in the
 * `<time>` element for the pre-hydration render.
 */
export function LocalDateTime({
  iso,
  className,
}: {
  iso: string
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) {
      setText(d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))
    }
  }, [iso])

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text ?? "…"}
    </time>
  )
}
