import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { RealtimePostgresChangesPayload } from '@supabase/realtime-js'
import type { Database, Tables } from '@/lib/supabase/database.types'

/**
 * Client-side Realtime helpers. These are NOT Server Actions — they run in the
 * browser with a `SupabaseClient<Database>` and return the subscribed channel so
 * the caller is responsible for `channel.unsubscribe()` on cleanup. RLS decides
 * which change rows a client actually receives.
 */

/**
 * L2 — Subscribe to `bingos` changes scoped to a card. Insert = "first to bingo"
 * alert; delete = a revoked win (D4).
 */
export function subscribeToBingos(
  client: SupabaseClient<Database>,
  cardId: string,
  onChange: (payload: RealtimePostgresChangesPayload<Tables<'bingos'>>) => void
): RealtimeChannel {
  // Unique channel name per subscriber: multiple components (grid + leaderboard)
  // subscribe to the same card, and Supabase reuses channels by name — a shared
  // name makes the 2nd `.on(...).subscribe()` throw "cannot add callbacks after
  // subscribe()".
  return client
    .channel(`bingos:card:${cardId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bingos', filter: `card_id=eq.${cardId}` },
      onChange
    )
    .subscribe()
}

/**
 * L3 — Subscribe to the caller's own `player_card_cells` changes for live
 * self-progress / leaderboard deltas.
 */
export function subscribeToPlayerCells(
  client: SupabaseClient<Database>,
  playerCardId: string,
  onChange: (payload: RealtimePostgresChangesPayload<Tables<'player_card_cells'>>) => void
): RealtimeChannel {
  return client
    .channel(`player_card_cells:${playerCardId}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_card_cells',
        filter: `player_card_id=eq.${playerCardId}`,
      },
      onChange
    )
    .subscribe()
}
