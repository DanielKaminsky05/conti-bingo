'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { withResult, ActionError, type ActionResult } from '@/lib/actions/result'
import { cardIdSchema, markCellSchema } from '@/lib/validation/play'
import { assertMarkingOpen } from '@/lib/actions/marking-window'
import {
  buildIdenticalLayout,
  buildShuffledLayout,
  type LayoutCell,
} from '@/lib/bingo/layout'
import type { TablesInsert } from '@/lib/supabase/database.types'

/**
 * P1 — Materialize the caller's player card for a card. Idempotent: if a
 * `player_cards` row already exists for (cardId, user.id) it is returned as-is.
 * Otherwise the card config + its challenges are loaded, a layout is built
 * (identical or a deterministic per-player shuffle), and the player card plus
 * its cells are inserted under RLS (a member may insert their own).
 */
export async function getOrCreatePlayerCard(
  input: unknown
): Promise<ActionResult<{ playerCardId: string }>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = cardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { cardId } = parsed.data

    // Idempotency: return the existing player card if one is already materialized.
    const { data: existing, error: existingError } = await supabase
      .from('player_cards')
      .select('id')
      .eq('card_id', cardId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingError) {
      throw new ActionError('error', existingError.message)
    }
    if (existing) {
      return { playerCardId: existing.id }
    }

    // Load the card config.
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('group_id, grid_size, layout_mode, free_space')
      .eq('id', cardId)
      .maybeSingle()

    if (cardError) {
      throw new ActionError('error', cardError.message)
    }
    if (!card) {
      throw new ActionError('not_found', 'Card not found.')
    }

    // Load its challenge pool in authoring order.
    const { data: challenges, error: challengesError } = await supabase
      .from('challenges')
      .select('id')
      .eq('card_id', cardId)
      .order('sort_index', { ascending: true })

    if (challengesError) {
      throw new ActionError('error', challengesError.message)
    }

    const challengeIds = (challenges ?? []).map((c) => c.id)

    // Build the layout (throws if the pool is too small for the grid).
    let layout: LayoutCell[]
    let shuffleSeed: number | null = null
    try {
      if (card.layout_mode === 'shuffled') {
        shuffleSeed = (Math.random() * 0x100000000) >>> 0
        layout = buildShuffledLayout(challengeIds, card.grid_size, card.free_space, shuffleSeed)
      } else {
        layout = buildIdenticalLayout(challengeIds, card.grid_size, card.free_space)
      }
    } catch (e) {
      throw new ActionError('error', e instanceof Error ? e.message : 'Could not build the card layout.')
    }

    // Seed the leaderboard counters from the initial layout so a freshly
    // materialized card reflects the pre-marked free space (the mark/unmark
    // trigger only recomputes on UPDATE, not on the initial INSERT).
    const initialMarks = layout.filter((c) => c.isMarked).length // free space, if any

    // Insert the player card (store the seed only for shuffled layouts).
    const { data: playerCard, error: insertError } = await supabase
      .from('player_cards')
      .insert({
        card_id: cardId,
        user_id: user.id,
        shuffle_seed: shuffleSeed,
        marks_count: initialMarks,
        points_total: 0, // free space carries no points
      })
      .select('id')
      .single()

    if (insertError) {
      // A concurrent create may have raced us to the unique (card_id, user_id).
      if (insertError.code === '23505') {
        const { data: raced } = await supabase
          .from('player_cards')
          .select('id')
          .eq('card_id', cardId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (raced) return { playerCardId: raced.id }
      }
      throw new ActionError('error', insertError.message)
    }

    // Materialize the cells.
    const cells: TablesInsert<'player_card_cells'>[] = layout.map((cell) => ({
      player_card_id: playerCard.id,
      position: cell.position,
      challenge_id: cell.challengeId,
      is_marked: cell.isMarked,
    }))

    const { error: cellsError } = await supabase.from('player_card_cells').insert(cells)
    if (cellsError) {
      throw new ActionError('error', cellsError.message)
    }

    // A new player card adds a row to the group's leaderboard/standings.
    revalidatePath(`/groups/${card.group_id}`, 'layout')
    return { playerCardId: playerCard.id }
  })
}

/**
 * P3 — Toggle a single square on the caller's own player card (honor system).
 * The DB `check_bingo()` trigger records or revokes wins in `bingos`; this action
 * never touches `bingos` directly. RLS restricts the update to the owner.
 */
export async function markCell(input: unknown): Promise<ActionResult<null>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = markCellSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { playerCardId, position, marked } = parsed.data

    // Resolve the owning card up front — needed for the end-of-schedule gate.
    const { data: playerCard } = await supabase
      .from('player_cards')
      .select('card_id')
      .eq('id', playerCardId)
      .maybeSingle()
    if (!playerCard) {
      throw new ActionError('not_found', 'That square is not available to mark.')
    }

    // Locked once the card's end time passes (hosts exempt — mirrors RLS).
    const groupId = await assertMarkingOpen(supabase, playerCard.card_id)

    const { data, error } = await supabase
      .from('player_card_cells')
      .update({ is_marked: marked, marked_at: marked ? new Date().toISOString() : null })
      .eq('player_card_id', playerCardId)
      .eq('position', position)
      .select('player_card_id')

    if (error) {
      throw new ActionError('error', error.message)
    }
    if (!data || data.length === 0) {
      throw new ActionError('not_found', 'That square is not available to mark.')
    }

    // Marks feed the leaderboard, card standings and completion counts.
    if (groupId) revalidatePath(`/groups/${groupId}`, 'layout')
    return null
  })
}
