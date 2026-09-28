import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"

/** The signed-in user, or null. Safe to call in Server Components (does not throw). */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** The signed-in user's profile row, or null. */
export async function getCurrentProfile(): Promise<Tables<"profiles"> | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  return data
}
