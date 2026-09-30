"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?"
}

/**
 * An avatar that opens an enlarged view (Instagram-style) when tapped. Only
 * interactive when there's an actual image — a plain initials fallback isn't
 * worth enlarging. Drop-in replacement for the Avatar+Image+Fallback trio.
 */
export function AvatarZoom({
  src,
  name,
  size = "default",
  className,
}: {
  src: string | null | undefined
  name: string
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const avatar = (
    <Avatar size={size} className={className}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback>{initial(name)}</AvatarFallback>
    </Avatar>
  )

  // No image → not clickable.
  if (!src) return avatar

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`View ${name}'s photo`}
        className={cn(
          "rounded-full transition-opacity hover:opacity-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        {avatar}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[90vw] border-none bg-transparent p-0 shadow-none"
        >
          <DialogTitle className="sr-only">{name}&apos;s photo</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={name}
            onClick={() => setOpen(false)}
            className="mx-auto size-72 max-w-[90vw] cursor-zoom-out rounded-full object-cover shadow-2xl ring-4 ring-background sm:size-80"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
