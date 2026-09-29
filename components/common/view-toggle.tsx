"use client"

import { useEffect, useState } from "react"
import { LayoutGridIcon, ListIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ViewMode = "grid" | "list"

/**
 * Remembers a grid/list preference in localStorage under `key`. Starts from
 * `initial` on the server and first client render (avoids a hydration mismatch),
 * then adopts the stored preference after mount.
 */
export function useViewMode(key: string, initial: ViewMode = "grid") {
  const [mode, setMode] = useState<ViewMode>(initial)

  useEffect(() => {
    const stored = window.localStorage.getItem(key)
    if (stored === "grid" || stored === "list") setMode(stored)
  }, [key])

  const update = (next: ViewMode) => {
    setMode(next)
    try {
      window.localStorage.setItem(key, next)
    } catch {
      /* ignore quota/private-mode failures */
    }
  }

  return [mode, update] as const
}

/** A small segmented control to switch between board and list rendering. */
export function ViewToggle({
  value,
  onChange,
  size = "default",
  className,
}: {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  size?: "default" | "sm"
  className?: string
}) {
  const btn = (mode: ViewMode, label: string, Icon: typeof LayoutGridIcon) => (
    <button
      type="button"
      onClick={() => onChange(mode)}
      aria-pressed={value === mode}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center justify-center rounded-md transition-colors",
        size === "sm" ? "size-7" : "size-8",
        value === mode
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </button>
  )

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5",
        className
      )}
      role="group"
      aria-label="Switch view"
    >
      {btn("grid", "Board view", LayoutGridIcon)}
      {btn("list", "List view", ListIcon)}
    </div>
  )
}
