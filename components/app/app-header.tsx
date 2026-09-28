"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { BellIcon, LogOutIcon, UserIcon } from "lucide-react"
import { signOut } from "@/lib/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { publicStorageUrl } from "@/lib/storage-url"
import { cn } from "@/lib/utils"
import type { Tables } from "@/lib/supabase/database.types"

export function AppHeader({ profile }: { profile: Tables<"profiles"> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const avatar = publicStorageUrl("avatars", profile.avatar_path)
  const initials = (profile.name || profile.username || "?").slice(0, 2).toUpperCase()

  function onSignOut() {
    start(async () => {
      await signOut()
      router.replace("/login")
      router.refresh()
    })
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            B
          </span>
          <span className="font-heading font-semibold">Conti-Bingo</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <BellIcon />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}
            >
              <Avatar className="size-7">
                {avatar && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {profile.name}
                <div className="text-xs font-normal text-muted-foreground">@{profile.username}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <UserIcon /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSignOut} disabled={pending}>
                <LogOutIcon /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
