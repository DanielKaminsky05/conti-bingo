"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateProfile } from "@/lib/actions/profile"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SubmitButton } from "@/components/common/submit-button"
import type { Tables } from "@/lib/supabase/database.types"

export function ProfileForm({ profile }: { profile: Tables<"profiles"> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [username, setUsername] = useState(profile.username)
  const [name, setName] = useState(profile.name)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    start(async () => {
      const res = await updateProfile({ username: username.trim(), name: name.trim() })
      if (!res.ok) {
        if (res.code === "conflict") {
          setUsernameError("That username is taken.")
          return
        }
        toast.error(res.error)
        return
      }
      toast.success("Profile updated.")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setUsernameError(null)
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={usernameError ? true : undefined}
          placeholder="your_handle"
        />
        {usernameError ? (
          <p className="text-sm text-destructive">{usernameError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            3–20 characters: lowercase letters, numbers, or underscores.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <SubmitButton pending={pending} type="submit">
        Save changes
      </SubmitButton>
    </form>
  )
}
