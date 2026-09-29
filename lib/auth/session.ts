import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { ActionError } from '@/lib/actions/result'

/**
 * Resolve the signed-in user for a Server Action, validating the JWT via
 * `getUser()` (never trust `getSession()`), and return a request-scoped server
 * client bound to their session. Throws `ActionError('unauthorized')` if absent.
 *
 * Uses the cached `getCurrentUser()` so multiple `requireUser()` / user reads
 * within one request invocation share a single Auth round-trip.
 */
export async function requireUser() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    throw new ActionError('unauthorized', 'You must be signed in to do that.')
  }
  return { supabase, user }
}
