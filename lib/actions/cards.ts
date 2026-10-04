'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { ActionError, withResult, type ActionResult } from '@/lib/actions/result'
import {
  createCardSchema,
  updateCardSchema,
  cardIdSchema,
  groupIdSchema,
  type CreateCardInput,
} from '@/lib/validation/cards'
import type { Tables, TablesInsert } from '@/lib/supabase/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Supabase = SupabaseClient<Database>
type CardRow = Tables<'cards'>

// Square images live in the same public bucket as group images, under
// `{groupId}/challenges/...`, so migration 06's storage RLS (admin writes,
// member reads, keyed on the leading groupId folder) already governs them.
const IMAGE_BUCKET = 'group-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

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
  // Co-op cards share ONE board: they're always an identical layout won by
  // blackout, regardless of what the (hidden) pickers held.
  const coop = input.gameMode === 'coop'
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({
      group_id: input.groupId,
      title: input.title,
      description: input.description ?? null,
      grid_size: input.gridSize,
      layout_mode: coop ? 'identical' : input.layoutMode,
      free_space: input.freeSpace,
      free_space_image_path: input.freeSpace ? input.freeSpaceImagePath ?? null : null,
      win_condition: coop ? 'blackout' : input.winCondition,
      game_mode: input.gameMode,
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
    text: c.text ?? null,
    image_path: c.imagePath ?? null,
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

    revalidatePath(`/groups/${parsed.data.groupId}`, 'layout')
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
    // every player's cells — done via the `rebuild_player_cards` RPC below.
    const structuralChange =
      (fields.gridSize !== undefined && fields.gridSize !== current.grid_size) ||
      (fields.layoutMode !== undefined && fields.layoutMode !== current.layout_mode) ||
      (fields.freeSpace !== undefined && fields.freeSpace !== current.free_space) ||
      (fields.gameMode !== undefined && fields.gameMode !== current.game_mode)

    // The card's effective mode after this update decides which materialization
    // to rebuild (co-op has one shared board; individual has per-player cards).
    const coop = (fields.gameMode ?? current.game_mode) === 'coop'

    // Apply the card-field patch (structural fields included).
    const patch: Database['public']['Tables']['cards']['Update'] = {}
    if (fields.title !== undefined) patch.title = fields.title
    if (fields.description !== undefined) patch.description = fields.description
    if (fields.gridSize !== undefined) patch.grid_size = fields.gridSize
    if (fields.gameMode !== undefined) patch.game_mode = fields.gameMode
    // Co-op forces identical layout + blackout win (single shared board).
    if (fields.layoutMode !== undefined) patch.layout_mode = coop ? 'identical' : fields.layoutMode
    if (fields.freeSpace !== undefined) patch.free_space = fields.freeSpace
    if (fields.freeSpaceImagePath !== undefined) patch.free_space_image_path = fields.freeSpaceImagePath
    if (fields.winCondition !== undefined) patch.win_condition = coop ? 'blackout' : fields.winCondition
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

    let needsRebuild = structuralChange

    if (challenges !== undefined) {
      const { data: existing, error: exErr } = await supabase
        .from('challenges')
        .select('id, sort_index, text, image_path')
        .eq('card_id', cardId)
        .order('sort_index', { ascending: true })
      if (exErr) throw new ActionError('error', exErr.message)

      const countChanged = !existing || existing.length !== challenges.length

      if (structuralChange || countChanged) {
        // Structural change or a different challenge count: replace the challenge
        // set and rebuild every player card (marks reset — D5 structural path).
        const { error: delErr } = await supabase.from('challenges').delete().eq('card_id', cardId)
        if (delErr) throw new ActionError('error', delErr.message)
        const rows: TablesInsert<'challenges'>[] = challenges.map((c, index) => ({
          card_id: cardId,
          text: c.text ?? null,
          image_path: c.imagePath ?? null,
          points: c.points,
          sort_index: index,
        }))
        const { error: insErr } = await supabase.from('challenges').insert(rows)
        if (insErr) throw new ActionError('error', insErr.message)
        needsRebuild = true
      } else {
        // Same challenge set: edit text/points IN PLACE so the stable
        // `challenges.id` (referenced by every player's cells) is preserved.
        const changedTextIds: string[] = []
        for (let i = 0; i < existing.length; i++) {
          const nextText = challenges[i].text ?? null
          const nextImage = challenges[i].imagePath ?? null
          const { error: upErr } = await supabase
            .from('challenges')
            .update({ text: nextText, image_path: nextImage, points: challenges[i].points })
            .eq('id', existing[i].id)
          if (upErr) throw new ActionError('error', upErr.message)
          // A changed prompt (text OR image) un-completes that square across players.
          if (existing[i].text !== nextText || existing[i].image_path !== nextImage) {
            changedTextIds.push(existing[i].id)
          }
        }
        // Individual mode: un-mark each edited square across all players
        // (revokes dependent bingos via the trigger), then recompute points.
        // Co-op cells reference the same stable challenge_id, so an in-place text
        // edit leaves the shared board's marks intact — nothing to reset.
        if (!coop) {
          for (const id of changedTextIds) {
            const { error: rErr } = await supabase.rpc('reset_edited_challenge', { p_challenge_id: id })
            if (rErr) throw new ActionError('error', rErr.message)
          }
          const { error: rcErr } = await supabase.rpc('recount_card', { p_card_id: cardId })
          if (rcErr) throw new ActionError('error', rcErr.message)
        }
      }
    }

    if (needsRebuild) {
      // Rebuild the mode-appropriate materialization: the shared co-op board, or
      // every player's individual card.
      const rpc = coop ? 'rebuild_coop_board' : 'rebuild_player_cards'
      const { error: rbErr } = await supabase.rpc(rpc, { p_card_id: cardId })
      if (rbErr) throw new ActionError('error', rbErr.message)
    }

    revalidatePath(`/groups/${card.group_id}`, 'layout')
    return card
  })
}

/**
 * Archive the group's active card (if any) then activate `cardId`, atomically,
 * via the `publish_card` SECURITY DEFINER RPC.
 */
async function activateCard(supabase: Supabase, cardId: string): Promise<CardRow> {
  const { data, error } = await supabase.rpc('publish_card', { p_card_id: cardId })
  if (error) throw new ActionError('error', error.message)
  if (!data) throw new ActionError('not_found', 'Card not found or not publishable.')
  return data as CardRow
}

/**
 * C7 — publish a draft: atomically archive the group's current active card and
 * set this card active (via the `publish_card` RPC).
 */
export async function publishCard(input: unknown): Promise<ActionResult<CardRow>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = cardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const card = await activateCard(supabase, parsed.data.cardId)

    revalidatePath(`/groups/${card.group_id}`, 'layout')
    return card
  })
}

/**
 * Archive a card (active or draft → archived). Admin-only via RLS. The card's
 * challenges and any player cards / co-op board are retained so the standings
 * history stays viewable; it just stops being the group's live card.
 */
export async function archiveCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = cardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { data, error } = await supabase
      .from('cards')
      .update({ status: 'archived' })
      .eq('id', parsed.data.cardId)
      .select('id, group_id')
    if (error) throw new ActionError('error', error.message)
    if (!data || data.length === 0) {
      throw new ActionError('forbidden', 'Card not found or not permitted.')
    }

    revalidatePath(`/groups/${data[0].group_id}`, 'layout')
    return { cardId: data[0].id }
  })
}

/**
 * Permanently delete a card and everything under it (challenges, player cards,
 * cells, bingos, co-op board — all ON DELETE CASCADE). Admin-only via RLS.
 * Irreversible; the UI confirms first.
 */
export async function deleteCard(input: unknown): Promise<ActionResult<{ cardId: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const parsed = cardIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    // Read group first (for revalidation) — RLS lets an admin see it.
    const { data: card } = await supabase
      .from('cards')
      .select('group_id')
      .eq('id', parsed.data.cardId)
      .maybeSingle()

    const { data, error } = await supabase
      .from('cards')
      .delete()
      .eq('id', parsed.data.cardId)
      .select('id')
    if (error) throw new ActionError('error', error.message)
    if (!data || data.length === 0) {
      throw new ActionError('forbidden', 'Card not found or not permitted.')
    }

    if (card?.group_id) revalidatePath(`/groups/${card.group_id}`, 'layout')
    return { cardId: parsed.data.cardId }
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

    revalidatePath(`/groups/${parsed.data.groupId}`, 'layout')
    return { cardId }
  })
}

/**
 * Upload a background image for a bingo square. Called from the card editor
 * while authoring; returns the Storage object path, which the editor keeps in
 * the draft and persists with the challenge on save (mirrors the group
 * background flow — see uploadGroupBackground in lib/actions/groups.ts).
 *
 * Authorization is enforced by Storage RLS: only a group owner/admin may write
 * under `{groupId}/...` in the `group-images` bucket. No DB write here.
 */
export async function uploadChallengeImage(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const groupId = formData.get('groupId')
    const file = formData.get('file')

    if (typeof groupId !== 'string' || !groupIdSchema.safeParse({ groupId }).success) {
      throw new ActionError('validation', 'A valid groupId is required.')
    }
    if (!(file instanceof File)) {
      throw new ActionError('validation', 'A file is required.')
    }
    if (!file.type.startsWith('image/')) {
      throw new ActionError('validation', 'File must be an image.')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ActionError('validation', 'Image must be 5 MB or smaller.')
    }

    const path = `${groupId}/challenges/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw new ActionError('error', uploadError.message)

    return { path }
  })
}
