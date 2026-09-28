import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import type { Tables } from '@/lib/supabase/database.types'

/**
 * U1 — Read a profile: the caller's own by default, or a group-mate's public
 * fields (RLS decides visibility). Throws `not_found` if no row is visible.
 */
export async function getProfile(userId?: string): Promise<Tables<'profiles'>> {
  const supabase = await createClient()

  let targetId = userId
  if (!targetId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      throw new ActionError('unauthorized', 'You must be signed in to do that.')
    }
    targetId = user.id
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (error) {
    throw new ActionError('error', error.message)
  }
  if (!data) {
    throw new ActionError('not_found', 'Profile not found.')
  }

  return data
}
