import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import { rankPlayers } from '@/lib/bingo/rank'
import type { Tables } from '@/lib/supabase/database.types'

/** A leaderboard row with the rank-relevant counters coerced to non-null. */
export type LeaderboardRow = Tables<'leaderboard'> & {
  user_id: string
  bingo_count: number
  points_total: number
  marks_count: number
}

/**
 * L1 — Read the group's standings for a card from the `security_invoker`
 * `leaderboard` view (RLS: group members only) and return them ranked by the
 * documented order (bingos → points → squares → earliest first bingo).
 */
export async function getLeaderboard(cardId: string): Promise<LeaderboardRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('card_id', cardId)

  if (error) {
    throw new ActionError('error', error.message)
  }

  const rows: LeaderboardRow[] = (data ?? []).map((row) => ({
    ...row,
    user_id: row.user_id ?? '',
    bingo_count: row.bingo_count ?? 0,
    points_total: row.points_total ?? 0,
    marks_count: row.marks_count ?? 0,
  }))

  return rankPlayers(rows)
}
