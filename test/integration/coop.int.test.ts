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
 *   - any member can mark an unclaimed square + unmark their own; a member
 *     CANNOT unmark someone else's; a host can unmark anyone's (migration 18)
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

  it('lets any member mark + unmark their own, blocks unmarking others, hosts override', async () => {
    const { owner, member, cardId } = await setup()
    const { data: boardId } = await member.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })

    // A regular member CAN mark an unclaimed square.
    const { data: marked, error: mErr } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: member.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('marked_by')
    expect(mErr, mErr?.message).toBeNull()
    expect(marked).toHaveLength(1)
    expect(marked![0].marked_by).toBe(member.id)

    // The owner marks a different square.
    await owner.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: owner.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 1)

    // The member CANNOT unmark the owner's square → RLS hides the row.
    const { data: stolen, error: sErr } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: false, marked_by: null, marked_at: null })
      .eq('board_id', boardId as string)
      .eq('position', 1)
      .select('id')
    expect(sErr).toBeNull()
    expect(stolen ?? []).toHaveLength(0)

    // The member CAN unmark their own square.
    const { data: ownUnmark } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: false, marked_by: null, marked_at: null })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(ownUnmark).toHaveLength(1)

    // A host CAN unmark anyone's square (the member re-marks 0 first).
    await member.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: member.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
    const { data: hostUnmark } = await owner.client
      .from('coop_board_cells')
      .update({ is_marked: false, marked_by: null, marked_at: null })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(hostUnmark).toHaveLength(1)
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

  it('locks marking for members once the card has ended (hosts exempt)', async () => {
    const { owner, member, cardId } = await setup()
    const { data: boardId } = await member.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })

    // Owner sets the end time to the past (migration 19 gate).
    await owner.client
      .from('cards')
      .update({ ends_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', cardId)

    // A member can no longer mark an unclaimed square.
    const { data: blocked } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: member.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(blocked ?? []).toHaveLength(0)

    // A host still can (exempt).
    const { data: hostMark } = await owner.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: owner.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(hostMark).toHaveLength(1)
  })

  it('locks marking for members before the card has started (hosts exempt)', async () => {
    const { owner, member, cardId } = await setup()
    const { data: boardId } = await member.client.rpc('get_or_create_coop_board', {
      p_card_id: cardId,
    })

    // Owner sets the start time to the future (migration 20 gate).
    await owner.client
      .from('cards')
      .update({ starts_at: new Date(Date.now() + 60 * 60_000).toISOString() })
      .eq('id', cardId)

    // A member can't mark before the start.
    const { data: blocked } = await member.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: member.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(blocked ?? []).toHaveLength(0)

    // A host still can (to set up).
    const { data: hostMark } = await owner.client
      .from('coop_board_cells')
      .update({ is_marked: true, marked_by: owner.id, marked_at: new Date().toISOString() })
      .eq('board_id', boardId as string)
      .eq('position', 0)
      .select('id')
    expect(hostMark).toHaveLength(1)
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
