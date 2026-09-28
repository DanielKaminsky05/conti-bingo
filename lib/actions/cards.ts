'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { ActionError, withResult, type ActionResult } from '@/lib/actions/result'
import {
  createCardSchema,
  updateCardSchema,
  cardIdSchema,
  type CreateCardInput,
} from '@/lib/validation/cards'
import type { Tables, TablesInsert } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Supabase = SupabaseClient<Database>
type CardRow = Tables<'cards'>

/**
 * Core insert of a draft card + its challenges, shared by `createCard` and
 * `replaceActiveCard`. Runs as the caller (RLS requires owner/admin of the
 * group). Not exported — helper only.
 */
async function insertDraftCard(
  supabase: Supabase,
  userId: string,
  input: CreateCardInput
): Promise<string> {
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({
      group_id: input.groupId,
      title: input.title,
      description: input.description ?? null,
      grid_size: input.gridSize,
      layout_mode: input.layoutMode,
      free_space: input.freeSpace,
      win_condition: input.winCondition,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single()

  if (cardError) throw new ActionError('error', cardError.message)
  if (!card) throw new ActionError('error', 'Card was not created.')

  const rows: TablesInsert<'challenges'>[] = input.challenges.map((c, index) => ({
    card_id: card.id,
    text: c.text,
    points: c.points,
    sort_index: index,
  }))

  const { error: challengeError } = await supabase.from('challenges').insert(rows)
  if (challengeError) throw new ActionError('error', challengeError.message)

  return card.id
}

/**
 * C1 — author a new card. Inserts a `cards` row with `status='draft'` +
 * `created_by=user.id` and its `challenges` (sort_index follows array order).
 * Owner/admin only (enforced by RLS). Going live happens via `publishCard`.
 */
export async function createCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = createCardSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const cardId = await insertDraftCard(supabase, user.id, parsed.data)

    revalidatePath(`/groups/${parsed.data.groupId}`)
    return { cardId }
  })
}

/**
 * C3 — edit an existing card at any time (D5). Updates the editable card fields
 * and, when provided, the card's own `challenges` rows (text/points).
 *
 * IMPORTANT: D5 also requires un-marking an edited square across ALL players'
 * cards (resetting `player_card_cells.is_marked` + revoking dependent bingos).
 * That mutates other users' rows and is blocked by RLS — it needs a
 * SECURITY DEFINER RPC that is intentionally deferred. We only edit the
 * challenge text/points on the card we own here.
 *
 * // TODO(rpc): needs SECURITY DEFINER reset_edited_challenge — reset
 * // is_marked=false on every player's cell pointing at an edited challenge and
 * // let the check_bingo trigger revoke the dependent bingos.
 */
export async function updateCard(input: unknown): Promise<ActionResult<CardRow>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = updateCardSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { cardId, challenges, ...fields } = parsed.data

    // Load the current card first so we can (a) detect structural changes and
    // (b) return it even when only challenges change.
    const { data: current, error: loadError } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single()
    if (loadError) throw new ActionError('error', loadError.message)
    if (!current) throw new ActionError('not_found', 'Card not found or not editable.')

    // Structural changes (grid size / layout / free space) require rebuilding
    // every player's cells — an across-players mutation blocked by RLS. Defer
    // honestly rather than silently corrupting player cards.
    // TODO(rpc): needs SECURITY DEFINER rebuild_player_cards(card_id).
    const structuralChange =
      (fields.gridSize !== undefined && fields.gridSize !== current.grid_size) ||
      (fields.layoutMode !== undefined && fields.layoutMode !== current.layout_mode) ||
      (fields.freeSpace !== undefined && fields.freeSpace !== current.free_space)
    if (structuralChange) {
      throw new ActionError(
        'error',
        'Changing grid size, layout mode, or free space after a card is created is not yet supported — it requires a database function that rebuilds every player card. Create a new card instead.'
      )
    }

    // Non-structural patch only.
    const patch: Database['public']['Tables']['cards']['Update'] = {}
    if (fields.title !== undefined) patch.title = fields.title
    if (fields.description !== undefined) patch.description = fields.description
    if (fields.winCondition !== undefined) patch.win_condition = fields.winCondition
    if (fields.startsAt !== undefined) patch.starts_at = fields.startsAt
    if (fields.endsAt !== undefined) patch.ends_at = fields.endsAt

    let card: CardRow = current
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from('cards')
        .update(patch)
        .eq('id', cardId)
        .select('*')
        .single()
      if (error) throw new ActionError('error', error.message)
      if (!data) throw new ActionError('not_found', 'Card not found or not editable.')
      card = data
    }

    // Edit challenge text/points IN PLACE (matched by sort_index) so the stable
    // `challenges.id` — which every player's `player_card_cells.challenge_id`
    // references — is preserved. Delete+reinsert would cascade-delete players'
    // cells and wipe their marks, so it is intentionally avoided.
    if (challenges !== undefined) {
      const { data: existing, error: exErr } = await supabase
        .from('challenges')
        .select('id, sort_index')
        .eq('card_id', cardId)
        .order('sort_index', { ascending: true })
      if (exErr) throw new ActionError('error', exErr.message)

      // Adding/removing challenges changes the grid and needs a player-card
      // rebuild — deferred, same as structural changes above.
      // TODO(rpc): needs SECURITY DEFINER rebuild_player_cards(card_id).
      if (!existing || existing.length !== challenges.length) {
        throw new ActionError(
          'error',
          'Adding or removing challenges after a card is created is not yet supported (it requires rebuilding every player card). Editing existing challenge text/points is fine.'
        )
      }

      for (let i = 0; i < existing.length; i++) {
        const { error: upErr } = await supabase
          .from('challenges')
          .update({ text: challenges[i].text, points: challenges[i].points })
          .eq('id', existing[i].id)
        if (upErr) throw new ActionError('error', upErr.message)
      }
      // NOTE: editing a challenge's text should also un-mark that square on every
      // player's card and revoke dependent bingos (D5). That is an across-players
      // mutation blocked by RLS.
      // TODO(rpc): needs SECURITY DEFINER reset_edited_challenge(challenge_id).
    }

    revalidatePath(`/groups/${card.group_id}`)
    return card
  })
}

/**
 * Archive the group's active card (if any) then activate `cardId`.
 *
 * NON-ATOMIC: the archive and the activate are two separate statements. Between
 * them there is briefly no active card; if the second write fails the group can
 * be left with no active card. We rely on the `one_active_card_per_group`
 * partial unique to prevent two active cards. Owner/admin only via RLS.
 *
 * // TODO(rpc): atomic publish_card — do the archive-current + activate-new in a
 * // single SECURITY DEFINER transaction.
 */
async function activateCard(supabase: Supabase, cardId: string): Promise<CardRow> {
  // Resolve the card's group so we can archive that group's current active card.
  const { data: target, error: loadError } = await supabase
    .from('cards')
    .select('id, group_id')
    .eq('id', cardId)
    .single()
  if (loadError) throw new ActionError('error', loadError.message)
  if (!target) throw new ActionError('not_found', 'Card not found.')

  const { error: archiveError } = await supabase
    .from('cards')
    .update({ status: 'archived' })
    .eq('group_id', target.group_id)
    .eq('status', 'active')
  if (archiveError) throw new ActionError('error', archiveError.message)

  const { data: activated, error: activateError } = await supabase
    .from('cards')
    .update({ status: 'active' })
    .eq('id', cardId)
    .select('*')
    .single()
  if (activateError) throw new ActionError('error', activateError.message)
  if (!activated) throw new ActionError('not_found', 'Card not found or not publishable.')

  return activated
}

/**
 * C7 — publish a draft: archive the group's current active card, then set this
 * card active. See `activateCard` for the non-atomicity caveat + deferred RPC.
 */
export async function publishCard(input: unknown): Promise<ActionResult<CardRow>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = cardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const card = await activateCard(supabase, parsed.data.cardId)

    revalidatePath(`/groups/${card.group_id}`)
    return card
  })
}

/**
 * C4 — replace the active card: create a fresh draft (via the create path) then
 * publish it, archiving the previous active card. Composed from the same
 * helpers, so it inherits the non-atomic publish caveat above.
 */
export async function replaceActiveCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = createCardSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const cardId = await insertDraftCard(supabase, user.id, parsed.data)
    await activateCard(supabase, cardId)

    revalidatePath(`/groups/${parsed.data.groupId}`)
    return { cardId }
  })
}
