"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { LogOutIcon, UserIcon } from "lucide-react"
import { signOut } from "@/lib/actions/auth"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { publicStorageUrl } from "@/lib/storage-url"
import { cn } from "@/lib/utils"
import type { Tables } from "@/lib/supabase/database.types"

export function AppHeader({
  profile,
  unreadNotifications,
}: {
  profile: Tables<"profiles">
  unreadNotifications: number
}) {
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
          <span className="font-heading font-semibold">Contibingo</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell userId={profile.id} initialUnread={unreadNotifications} />
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
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {profile.name}
                  <div className="text-xs font-normal text-muted-foreground">@{profile.username}</div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
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
