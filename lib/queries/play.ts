import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import {
  aggregateCompletions,
  type ChallengeCompletions,
  type CompletionRow,
} from '@/lib/bingo/completions'
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

export type { ChallengeCompletions } from '@/lib/bingo/completions'

/**
 * P4 — Aggregate, per challenge on the given card, WHO has that challenge marked.
 *
 * Migration 10 lets any group member SELECT other players' `player_card_cells`
 * for cards in their group, so a plain nested read works (no RLS change / RPC).
 * We select marked cells with a non-null challenge for the card's player cards,
 * joined up to each player's profile, then aggregate in a pure helper.
 *
 * Returns `Record<challengeId, { count, users: { id, name, avatarPath }[] }>`.
 * De-duplicates per (challenge, user). Counts reflect the load-time snapshot —
 * live updates are a follow-up (see the board's realtime subscription).
 */
export async function getChallengeCompletions(
  cardId: string
): Promise<ChallengeCompletions> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('player_card_cells')
    .select(
      'challenge_id, is_marked, player_cards!inner(card_id, profiles!inner(id, name, avatar_path))'
    )
    .eq('is_marked', true)
    .not('challenge_id', 'is', null)
    .eq('player_cards.card_id', cardId)

  if (error) {
    throw new ActionError('error', error.message)
  }

  type Joined = {
    challenge_id: string | null
    is_marked: boolean
    player_cards: {
      card_id: string
      profiles: { id: string; name: string | null; avatar_path: string | null } | null
    } | null
  }

  const rows: CompletionRow[] = ((data ?? []) as unknown as Joined[]).map((r) => ({
    challengeId: r.challenge_id,
    isMarked: r.is_marked,
    userId: r.player_cards?.profiles?.id ?? '',
    name: r.player_cards?.profiles?.name ?? null,
    avatarPath: r.player_cards?.profiles?.avatar_path ?? null,
  }))

  return aggregateCompletions(rows)
}
