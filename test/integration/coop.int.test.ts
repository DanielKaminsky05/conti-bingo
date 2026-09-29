import { describe, it, expect, afterAll } from 'vitest'
import {
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  anonClient,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Integration tests for group co-op bingo (migration 14) — the DATABASE behavior
 * the co-op endpoints rely on, exercised AS real users so RLS/trigger/RPC apply.
 *
 * Verifies:
 *   - get_or_create_coop_board seeds one shared board (idempotent)
 *   - a regular member CANNOT mark; a host (owner/admin) can mark and unmark
 *   - marking every cell sets coop_boards.completed_at; unmarking one clears it
 *   - a non-member can neither read nor mark the board
 *
 * Skips cleanly when SUPABASE_SERVICE_ROLE_KEY is absent.
 */

describe.skipIf(!hasServiceRole)('co-op bingo (integration)', () => {
  const createdUsers: string[] = []

  async function setup() {
    const owner = await createTestUser('Coop Owner')
    createdUsers.push(owner.id)
    const { data: groupData, error: gErr } = await owner.client.rpc('create_group', {
      p_name: `Coop Group ${owner.id.slice(0, 8)}`,
    })
    expect(gErr, gErr?.message).toBeNull()
    const group = groupData as unknown as { id: string; join_code: string }

    const member = await createTestUser('Coop Member')
    createdUsers.push(member.id)
    const { error: jErr } = await member.client.rpc('join_group', { p_code: group.join_code })
    expect(jErr, jErr?.message).toBeNull()

    // A 4×4 co-op card (16 squares, no free space) — created + published by owner.
    const { data: card, error: cErr } = await owner.client
      .from('cards')
      .insert({
        group_id: group.id,
        title: 'Coop Card',
        grid_size: 4,
        layout_mode: 'identical',
        free_space: false,
        win_condition: 'blackout',
        game_mode: 'coop',
        status: 'draft',
        created_by: owner.id,
      })
      .select('id')
      .single()
    expect(cErr, cErr?.message).toBeNull()
    const cardId = card!.id

    const rows = Array.from({ length: 16 }, (_, i) => ({
      card_id: cardId,
      text: `square ${i + 1}`,
      points: 1,
      sort_index: i,
    }))
    const { error: chErr } = await owner.client.from('challenges').insert(rows)
    expect(chErr, chErr?.message).toBeNull()

    const { error: pErr } = await owner.client.rpc('publish_card', { p_card_id: cardId })
    expect(pErr, pErr?.message).toBeNull()

    return { owner, member, groupId: group.id, cardId }
  }

  it('creates one shared board idempotently and seeds 16 cells', async () => {
    const { member, cardId } = await setup()

    const { data: b1, error: e1 } = await member.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })
    expect(e1, e1?.message).toBeNull()
    expect(b1).toBeTruthy()

    // Second call returns the SAME board (idempotent).
    const { data: b2 } = await member.client.rpc('get_or_create_coop_board', { p_card_id: cardId })
    expect(b2).toBe(b1)

    const { count } = await member.client
      .from('coop_board_cells')
      .select('id', { count: 'exact', head: true })
      .eq('board_id', b1 as string)
    expect(count).toBe(16)
  })

  it('lets a host mark/unmark but blocks a regular member', async () => {
    const { owner, member, cardId } = await setup()
    const { data: boardId } = await member.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })

    // A regular member cannot mark → RLS hides the row (0 updated).
    const { data: blocked, error: bErr } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: member.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(bErr).toBeNull()
    expect(blocked ?? []).toHaveLength(0)

    // The owner (host) can mark it.
    const { data: marked, error: mErr } = await owner.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: owner.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('marked_by')
    expect(mErr, mErr?.message).toBeNull()
    expect(marked).toHaveLength(1)
    expect(marked![0].marked_by).toBe(owner.id)

    // ...and unmark it (hosts have full control).
    const { data: unmarked, error: uErr } = await owner.client
      .from('coop_board_cells')
      .update({ is_marked: false, marked_by: null, marked_at: null })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(uErr, uErr?.message).toBeNull()
    expect(unmarked).toHaveLength(1)
  })

  it('sets completed_at on blackout and clears it when a square is unmarked', async () => {
    const { owner, cardId } = await setup()
    const { data: boardId } = await owner.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })

    // Host marks all 16 squares.
    for (let pos = 0; pos < 16; pos++) {
      const { error } = await owner.client
        .from('coop_board_cells')
        .update({ is_marked: true, marked_by: owner.id, marked_at: new Date().toISOString() })
        .eq('board_id', boardId as string)
        .eq('position', pos)
      expect(error, error?.message).toBeNull()
    }

    const { data: done } = await owner.client
      .from('coop_boards')
      .select('completed_at')
      .eq('id', boardId as string)
      .single()
    expect(done!.completed_at).not.toBeNull()

    // Unmark one → blackout revoked.
    await owner.client
      .from('coop_board_cells')
      .update({ is_marked: false, marked_by: null, marked_at: null })
      .eq('board_id', boardId as string)
      .eq('position', 3)

    const { data: revoked } = await owner.client
      .from('coop_boards')
      .select('completed_at')
      .eq('id', boardId as string)
      .single()
    expect(revoked!.completed_at).toBeNull()
  })

  it('blocks a non-member from reading or creating the board', async () => {
    const { cardId } = await setup()
    const outsider = await createTestUser('Outsider')
    createdUsers.push(outsider.id)

    // RPC rejects a non-member.
    const { error: rpcErr } = await outsider.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })
    expect(rpcErr).not.toBeNull()

    // And a plain anon (signed-out) client sees no boards.
    const anon = anonClient()
    const { data } = await anon.from('coop_boards').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  afterAll(async () => {
    await deleteTestUsers(...createdUsers)
  })
})
