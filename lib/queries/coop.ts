import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import {
  aggregateCoopContributions,
  type CoopContributionRow,
  type CoopMarkRow,
} from '@/lib/bingo/coop-standings'

export type { CoopContributionRow } from '@/lib/bingo/coop-standings'

/** Progress of the group's shared board (for the "team progress" header). */
export type CoopProgress = {
  boardId: string
  total: number
  marked: number
  completedAt: string | null
}

/**
 * Co-op board progress for a card, or null if the board hasn't been created yet
 * (no member has opened the card). Group-member read via RLS.
 */
export async function getCoopProgress(cardId: string): Promise<CoopProgress | null> {
  const supabase = await createClient()

  const { data: board, error: boardError } = await supabase
    .from('coop_boards')
    .select('id, completed_at')
    .eq('card_id', cardId)
    .maybeSingle()
  if (boardError) throw new ActionError('error', boardError.message)
  if (!board) return null

  const { data: cells, error: cellsError } = await supabase
    .from('coop_board_cells')
    .select('is_marked')
    .eq('board_id', board.id)
  if (cellsError) throw new ActionError('error', cellsError.message)

  const total = cells?.length ?? 0
  const marked = (cells ?? []).filter((c) => c.is_marked).length
  return { boardId: board.id, total, marked, completedAt: board.completed_at }
}

/**
 * Per-player contribution standings for a co-op card: who marked how many
 * squares (free space excluded), ranked by squares → points → earliest mark.
 * Empty when the board doesn't exist yet.
 */
export async function getCoopStandings(cardId: string): Promise<CoopContributionRow[]> {
  const supabase = await createClient()

  const { data: board, error: boardError } = await supabase
    .from('coop_boards')
    .select('id')
    .eq('card_id', cardId)
    .maybeSingle()
  if (boardError) throw new ActionError('error', boardError.message)
  if (!board) return []

  const { data, error } = await supabase
    .from('coop_board_cells')
    .select(
      'marked_at, challenge:challenges(points), marker:profiles!coop_board_cells_marked_by_fkey(id, name, avatar_path)'
    )
    .eq('board_id', board.id)
    .eq('is_marked', true)
    .not('marked_by', 'is', null)
    .not('challenge_id', 'is', null) // exclude the free space

  if (error) throw new ActionError('error', error.message)

  type Joined = {
    marked_at: string | null
    challenge: { points: number } | null
    marker: { id: string; name: string | null; avatar_path: string | null } | null
  }

  const rows: CoopMarkRow[] = ((data ?? []) as unknown as Joined[]).map((r) => ({
    userId: r.marker?.id ?? '',
    name: r.marker?.name ?? null,
    avatarPath: r.marker?.avatar_path ?? null,
    points: r.challenge?.points ?? 0,
    markedAt: r.marked_at,
  }))

  return aggregateCoopContributions(rows)
}
