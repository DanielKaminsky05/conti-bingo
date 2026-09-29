import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import type { Enums } from "@/lib/supabase/database.types"

/**
 * The current user's role in a group, or null if not a member.
 *
 * Cached per request, and reuses the cached `getCurrentUser()` rather than
 * calling `getUser()` again — so a page that reads both the role and the user
 * (e.g. Members) makes a single Auth round-trip, not two.
 */
export const getMyRole = cache(
  async (groupId: string): Promise<Enums<"member_role"> | null> => {
    const user = await getCurrentUser()
    if (!user) return null
    const supabase = await createClient()
    const { data } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle()
    return data?.role ?? null
  }
)

export function isHost(role: Enums<"member_role"> | null): boolean {
  return role === "owner" || role === "admin"
}
