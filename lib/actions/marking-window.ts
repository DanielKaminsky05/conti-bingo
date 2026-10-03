import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ActionError } from '@/lib/actions/result'
import { getMyRole, isHost } from '@/lib/queries/membership'

/**
 * Throw a friendly error if a card's end time has passed and the caller isn't a
 * host — mirrors the RLS gate (migration 19) so the UI gets a clear message
 * instead of a generic "not available" when a stale page tries to mark. Cards
 * with no `ends_at` are always open. RLS remains the real enforcement.
 */
export async function assertMarkingOpen(
  supabase: SupabaseClient<Database>,
  cardId: string
): Promise<void> {
  const { data: card } = await supabase
    .from('cards')
    .select('ends_at, group_id')
    .eq('id', cardId)
    .maybeSingle()

  if (!card?.ends_at) return
  if (new Date(card.ends_at).getTime() > Date.now()) return

  const role = await getMyRole(card.group_id)
  if (!isHost(role)) {
    throw new ActionError('forbidden', 'This card has ended — marking is closed.')
  }
}
