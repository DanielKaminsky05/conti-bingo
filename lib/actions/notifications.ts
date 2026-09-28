'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { withResult, ActionError, type ActionResult } from '@/lib/actions/result'
import { markReadSchema } from '@/lib/validation/notifications'

/**
 * N2 — Mark the caller's notifications read. When `id` is provided, marks that
 * single notification (scoped to the caller via id + user_id, and RLS); when
 * omitted, marks all of the caller's currently-unread notifications. Setting
 * `read_at` is idempotent.
 */
export async function markNotificationRead(
  input: unknown
): Promise<ActionResult<null>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = markReadSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { id } = parsed.data

    const readAt = new Date().toISOString()

    let query = supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)

    if (id) {
      query = query.eq('id', id)
    } else {
      query = query.is('read_at', null)
    }

    const { error } = await query
    if (error) {
      throw new ActionError('error', error.message)
    }

    revalidatePath('/notifications')
    return null
  })
}
