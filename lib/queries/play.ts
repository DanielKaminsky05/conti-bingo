import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import type { Tables } from '@/lib/supabase/database.types'

export type PlayerCardWithCells = Tables<'player_cards'> & {
  cells: Tables<'player_card_cells'>[]
}

/**
 * P2 — Read a player card plus its cells + mark state. RLS restricts visibility
 * to the owner, so another player's cells are never returned (IDOR-safe).
 * Throws `not_found` when no owned row is visible.
 */
export async function getPlayerCard(playerCardId: string): Promise<PlayerCardWithCells> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('player_cards')
    .select('*, cells:player_card_cells(*)')
    .eq('id', playerCardId)
    .maybeSingle()

  if (error) {
    throw new ActionError('error', error.message)
  }
  if (!data) {
    throw new ActionError('not_found', 'Player card not found.')
  }

  return data as PlayerCardWithCells
}
