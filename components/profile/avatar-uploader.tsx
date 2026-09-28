"use client"

import { useRef, useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { uploadAvatar, removeAvatar } from "@/lib/actions/profile"
import { publicStorageUrl } from "@/lib/storage-url"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/common/submit-button"
import type { Tables } from "@/lib/supabase/database.types"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

function initialsOf(profile: Tables<"profiles">): string {
  const source = profile.name?.trim() || profile.username || ""
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2)
  return letters.toUpperCase() || "?"
}

export function AvatarUploader({ profile }: { profile: Tables<"profiles"> }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)

  const currentUrl = publicStorageUrl("avatars", profile.avatar_path)
  const shownUrl = preview ?? currentUrl

  // Revoke any object URL we create for the preview.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Avatar must be an image.")
      e.target.value = ""
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Avatar must be 5 MB or smaller.")
      e.target.value = ""
      return
    }

    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))

    const formData = new FormData()
    formData.append("file", file)

    start(async () => {
      const res = await uploadAvatar(formData)
      if (!res.ok) {
        toast.error(res.error)
        setPreview((p) => {
          if (p) URL.revokeObjectURL(p)
          return null
        })
        if (inputRef.current) inputRef.current.value = ""
        return
      }
      toast.success("Avatar updated.")
      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    })
  }

  function onRemove() {
    start(async () => {
      const res = await removeAvatar()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p)
        return null
      })
      if (inputRef.current) inputRef.current.value = ""
      toast.success("Avatar removed.")
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" className="size-16">
        {shownUrl && <AvatarImage src={shownUrl} alt="Your avatar" />}
        <AvatarFallback className="text-base">{initialsOf(profile)}</AvatarFallback>
      </Avatar>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
          disabled={pending}
        />
        <SubmitButton
          type="button"
          variant="outline"
          size="sm"
          pending={pending}
          onClick={() => inputRef.current?.click()}
        >
          {currentUrl ? "Change photo" : "Upload photo"}
        </SubmitButton>
        {profile.avatar_path && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
