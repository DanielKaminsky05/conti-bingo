import { createClient } from "@/lib/supabase/server"
import type { Enums } from "@/lib/supabase/database.types"

/** The current user's role in a group, or null if not a member. */
export async function getMyRole(groupId: string): Promise<Enums<"member_role"> | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()
  return data?.role ?? null
}

export function isHost(role: Enums<"member_role"> | null): boolean {
  return role === "owner" || role === "admin"
}
