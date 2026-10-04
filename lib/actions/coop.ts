'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { ActionError, withResult, type ActionResult } from '@/lib/actions/result'
import { coopCardIdSchema, markCoopCellSchema } from '@/lib/validation/coop'
import { assertMarkingOpen } from '@/lib/actions/marking-window'

/**
 * Co-op ("group bingo") mutations. In co-op mode the whole group shares ONE
 * board (see migration 14). All membership/authorization is enforced by the
 * `get_or_create_coop_board` RPC and by RLS on `coop_board_cells` — we never use
 * the service role here.
 */

/**
 * Ensure the shared board for a co-op card exists (idempotent) and return its id.
 * First member to open the card materializes it via the SECURITY DEFINER RPC.
 */
export async function getOrCreateCoopBoard(
  input: unknown
): Promise<ActionResult<{ boardId: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = coopCardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { data, error } = await supabase.rpc('get_or_create_coop_board', {
      p_card_id: parsed.data.cardId,
    })
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('not_found', 'Co-op board not found.')

    return { boardId: data }
  })
}

/**
 * Mark/unmark a square on the shared board. RLS enforces the co-op rule: any
 * member may mark an unclaimed square and unmark their own; hosts (owner/admin)
 * may unmark anyone's. `marked_by` records who marked each square (contributions
 * leaderboard). The blackout trigger updates `coop_boards.completed_at`.
 */
export async function markCoopCell(input: unknown): Promise<ActionResult<null>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = markCoopCellSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { cardId, position, marked } = parsed.data

    // Locked once the card's end time passes (hosts exempt — mirrors RLS).
    const groupId = await assertMarkingOpen(supabase, cardId)

    // Resolve the board (creates it if this is the group's first interaction).
    const { data: boardId, error: boardError } = await supabase.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })
    if (boardError) throw new ActionError('error', boardError.message)
    if (!boardId) throw new ActionError('not_found', 'Co-op board not found.')

    const { data, error } = await supabase
      .from('coop_board_cells')
      .update({
        is_marked: marked,
        marked_by: marked ? user.id : null,
        marked_at: marked ? new Date().toISOString() : null,
      })
      .eq('board_id', boardId)
      .eq('position', position)
      .select('id')

    if (error) throw new ActionError('error', error.message)
    // RLS returns zero rows when a member tries to unmark someone else's square.
    if (!data || data.length === 0) {
      throw new ActionError(
        'forbidden',
        marked ? 'That square is already taken.' : 'You can only unmark squares you marked.'
      )
    }

    // Marks feed the shared board, contributions standings and card detail.
    if (groupId) revalidatePath(`/groups/${groupId}`, 'layout')
    return null
  })
}
