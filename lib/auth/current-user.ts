import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"

/**
 * The signed-in user, or null. Safe to call in Server Components (does not throw).
 *
 * Wrapped in React `cache()` so repeated calls within a single request/render
 * collapse to ONE round-trip to the Supabase Auth server. `getUser()` validates
 * the JWT over the network (never `getSession()`), so without this a layout +
 * page that each need the user would pay that latency twice. All other auth
 * helpers (`getMyRole`, `requireUser`, `getCurrentProfile`) route through this.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/** The signed-in user's profile row, or null. */
export const getCurrentProfile = cache(async (): Promise<Tables<"profiles"> | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()
  return data
})
