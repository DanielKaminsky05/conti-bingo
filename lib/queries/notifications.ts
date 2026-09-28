import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import { listNotificationsSchema, type ListNotificationsInput } from '@/lib/validation/notifications'
import type { Tables } from '@/lib/supabase/database.types'

/**
 * N1 — List the caller's notifications, newest first. RLS scopes rows to the
 * signed-in recipient; `unreadOnly` further filters to unread. Notifications are
 * written server-side (triggers / Server Actions) — clients only read + mark read.
 */
export async function listNotifications(
  input?: ListNotificationsInput
): Promise<Tables<'notifications'>[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new ActionError('unauthorized', 'You must be signed in to do that.')
  }

  const { limit, unreadOnly } = listNotificationsSchema.parse(input ?? {})

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query
  if (error) {
    throw new ActionError('error', error.message)
  }

  return data ?? []
}
