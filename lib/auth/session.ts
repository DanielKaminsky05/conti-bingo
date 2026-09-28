import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'

/**
 * Resolve the signed-in user for a Server Action, validating the JWT via
 * `getUser()` (never trust `getSession()`), and return a request-scoped server
 * client bound to their session. Throws `ActionError('unauthorized')` if absent.
 */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new ActionError('unauthorized', 'You must be signed in to do that.')
  }
  return { supabase, user }
}
