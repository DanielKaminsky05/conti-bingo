import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ActionError } from '@/lib/actions/result'
import { getMyRole, isHost } from '@/lib/queries/membership'

/**
 * Throw a friendly error if the caller tries to mark outside a card's schedule
 * window and isn't a host — mirrors the RLS gate (migrations 19–20) so the UI
 * gets a clear message instead of a generic "not available". Null bounds are
 * open-ended. RLS remains the real enforcement.
 *
 * Returns the card's group id (null if the card isn't visible) so callers can
 * revalidate the group's routes without a second lookup.
 */
export async function assertMarkingOpen(
  supabase: SupabaseClient<Database>,
  cardId: string
): Promise<string | null> {
  const { data: card } = await supabase
    .from('cards')
    .select('starts_at, ends_at, group_id')
    .eq('id', cardId)
    .maybeSingle()

  if (!card) return null

  const now = Date.now()
  const beforeStart = !!card.starts_at && new Date(card.starts_at).getTime() > now
  const afterEnd = !!card.ends_at && new Date(card.ends_at).getTime() <= now
  if (!beforeStart && !afterEnd) return card.group_id

  // Hosts can mark any time (set up / finish up).
  const role = await getMyRole(card.group_id)
  if (isHost(role)) return card.group_id

  throw new ActionError(
    'forbidden',
    beforeStart ? "This card hasn't started yet." : 'This card has ended — marking is closed.'
  )
}
