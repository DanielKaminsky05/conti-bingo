import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  admin,
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'
import { buildIdenticalLayout } from '@/lib/bingo/layout'

/**
 * Integration tests for the Play + Leaderboard bucket (P1–P3, L1–L3).
 *
 * Exercises the DATABASE behavior the endpoints rely on, AS real users so RLS
 * applies. Skips cleanly when the service-role key is absent.
 *
 * Setup uses `create_group` (owner client, real owner membership) plus `admin()`
 * to author the active card + 24 challenges quickly. Player-side actions
 * (materialize, mark) run through the user client so RLS is enforced.
 */

const GRID = 5
const FREE_SPACE = true
const CHALLENGE_COUNT = 24 // 5×5 − 1 free center
const CENTER = 12 // (25 − 1) / 2

describe.skipIf(!hasServiceRole)('play + leaderboard (integration)', () => {
  let owner: TestUser
  let intruder: TestUser
  let groupId: string
  let cardId: string
  /** challenge ids ordered by sort_index 0..23 */
  let challengeIds: string[]

  beforeAll(async () => {
    const a = admin()
    owner = await createTestUser('Bingo Owner')
    intruder = await createTestUser('Nosy Intruder')

    // Owner creates the group via the SECURITY DEFINER RPC (enrolls owner as
    // the `owner` member and mints a join_code).
    const { data: group, error: gErr } = await owner.client.rpc('create_group', {
      p_name: `Play IT ${crypto.randomUUID()}`,
    })
    if (gErr) throw gErr
    groupId = (group as { id: string }).id

    // Author an active 5×5 card + 24 challenges with admin (RLS-bypassing setup;
    // card authoring belongs to the Cards bucket).
    const { data: card, error: cErr } = await a
      .from('cards')
      .insert({
        group_id: groupId,
        title: 'Integration Card',
        grid_size: GRID,
        layout_mode: 'identical',
        free_space: FREE_SPACE,
        win_condition: 'line',
        status: 'active',
        created_by: owner.id,
      })
      .select('id')
      .single()
    if (cErr) throw cErr
    cardId = card.id

    const { data: chs, error: chErr } = await a
      .from('challenges')
      .insert(
        Array.from({ length: CHALLENGE_COUNT }, (_, i) => ({
          card_id: cardId,
          text: `Challenge ${i}`,
          points: i + 1, // weighted, distinct points per square
          sort_index: i,
        }))
      )
      .select('id, sort_index')
    if (chErr) throw chErr
    challengeIds = chs!
      .sort((x, y) => x.sort_index - y.sort_index)
      .map((c) => c.id)
    expect(challengeIds).toHaveLength(CHALLENGE_COUNT)
  })

  afterAll(async () => {
    await deleteTestUsers(owner?.id, intruder?.id)
  })

  /**
   * Materialize the owner's player card (P1) with the identical layout:
   * one player_cards row + 25 cells, free center pre-marked. Replicates the
   * Server Action's Supabase writes as the authed user (RLS applies).
   */
  async function materializeOwnerCard(): Promise<string> {
    // Idempotent create of the player_cards row (unique (card_id, user_id)).
    const existing = await owner.client
      .from('player_cards')
      .select('id')
      .eq('card_id', cardId)
      .eq('user_id', owner.id)
      .maybeSingle()
    if (existing.data) return existing.data.id

    const { data: pc, error } = await owner.client
      .from('player_cards')
      .insert({ card_id: cardId, user_id: owner.id, shuffle_seed: null })
      .select('id')
      .single()
    if (error) throw error

    const cells = buildIdenticalLayout(challengeIds, GRID, FREE_SPACE).map((c) => ({
      player_card_id: pc.id,
      position: c.position,
      challenge_id: c.challengeId,
      is_marked: c.isMarked,
      marked_at: c.isMarked ? new Date().toISOString() : null,
    }))
    const { error: cellErr } = await owner.client.from('player_card_cells').insert(cells)
    if (cellErr) throw cellErr
    return pc.id
  }

  it('materializes a player card with 25 cells and a pre-marked free center; second call does not duplicate', async () => {
    const pcId = await materializeOwnerCard()

    const cells = await owner.client
      .from('player_card_cells')
      .select('position, challenge_id, is_marked')
      .eq('player_card_id', pcId)
    expect(cells.error).toBeNull()
    expect(cells.data).toHaveLength(GRID * GRID)

    const center = cells.data!.find((c) => c.position === CENTER)!
    expect(center.challenge_id).toBeNull()
    expect(center.is_marked).toBe(true)
    // exactly one marked cell so far (the free center)
    expect(cells.data!.filter((c) => c.is_marked)).toHaveLength(1)

    // A second materialize must NOT create a duplicate (unique (card_id, user_id)).
    const second = await materializeOwnerCard()
    expect(second).toBe(pcId)
    const dupCheck = await owner.client
      .from('player_cards')
      .select('id')
      .eq('card_id', cardId)
      .eq('user_id', owner.id)
    expect(dupCheck.data).toHaveLength(1)

    // The direct duplicate insert is rejected by the unique constraint.
    const dupInsert = await owner.client
      .from('player_cards')
      .insert({ card_id: cardId, user_id: owner.id })
    expect(dupInsert.error).not.toBeNull()
  })

  it('completing a full row inserts a row bingo and bumps the counters (DB trigger)', async () => {
    const pcId = await materializeOwnerCard()

    // Row 0 = positions 0..4. Mark each via UPDATE (the trigger is AFTER UPDATE OF is_marked).
    for (let position = 0; position < GRID; position++) {
      const { error } = await owner.client
        .from('player_card_cells')
        .update({ is_marked: true, marked_at: new Date().toISOString() })
        .eq('player_card_id', pcId)
        .eq('position', position)
      expect(error).toBeNull()
    }

    const bingos = await owner.client
      .from('bingos')
      .select('type, line_key, user_id, card_id')
      .eq('player_card_id', pcId)
    expect(bingos.error).toBeNull()
    const rowBingo = bingos.data!.find((b) => b.line_key === 'row-0')
    expect(rowBingo).toBeTruthy()
    expect(rowBingo!.type).toBe('line')
    expect(rowBingo!.user_id).toBe(owner.id)
    expect(rowBingo!.card_id).toBe(cardId)

    const pc = await owner.client
      .from('player_cards')
      .select('bingo_count, first_bingo_at, marks_count')
      .eq('id', pcId)
      .single()
    expect(pc.error).toBeNull()
    expect(pc.data!.bingo_count).toBe(1)
    expect(pc.data!.first_bingo_at).not.toBeNull()
    // 5 row cells + the pre-marked free center = 6 marks
    expect(pc.data!.marks_count).toBe(6)
  })

  it('unmarking a contributing cell revokes (deletes) the bingo (revocable — D4)', async () => {
    const pcId = await materializeOwnerCard()
    // Ensure the row is complete first (idempotent).
    for (let position = 0; position < GRID; position++) {
      await owner.client
        .from('player_card_cells')
        .update({ is_marked: true, marked_at: new Date().toISOString() })
        .eq('player_card_id', pcId)
        .eq('position', position)
    }

    // Unmark one cell of row-0.
    const { error } = await owner.client
      .from('player_card_cells')
      .update({ is_marked: false, marked_at: null })
      .eq('player_card_id', pcId)
      .eq('position', 2)
    expect(error).toBeNull()

    const bingos = await owner.client
      .from('bingos')
      .select('line_key')
      .eq('player_card_id', pcId)
      .eq('line_key', 'row-0')
    expect(bingos.data ?? []).toHaveLength(0)

    const pc = await owner.client
      .from('player_cards')
      .select('bingo_count, first_bingo_at')
      .eq('id', pcId)
      .single()
    expect(pc.data!.bingo_count).toBe(0)
    expect(pc.data!.first_bingo_at).toBeNull()

    // Re-completing re-inserts the bingo.
    await owner.client
      .from('player_card_cells')
      .update({ is_marked: true, marked_at: new Date().toISOString() })
      .eq('player_card_id', pcId)
      .eq('position', 2)
    const back = await owner.client
      .from('bingos')
      .select('line_key')
      .eq('player_card_id', pcId)
      .eq('line_key', 'row-0')
    expect(back.data).toHaveLength(1)
  })

  it('a different user cannot read or update the first user\'s cells (RLS IDOR)', async () => {
    const pcId = await materializeOwnerCard()

    // SELECT: the intruder sees none of the owner's cells.
    const read = await intruder.client
      .from('player_card_cells')
      .select('id, is_marked')
      .eq('player_card_id', pcId)
    expect(read.error).toBeNull() // RLS filters rather than errors
    expect(read.data ?? []).toHaveLength(0)

    // UPDATE: the intruder cannot flip the owner's cell — 0 rows affected, value unchanged.
    const upd = await intruder.client
      .from('player_card_cells')
      .update({ is_marked: false })
      .eq('player_card_id', pcId)
      .eq('position', 0)
      .select('id')
    expect(upd.data ?? []).toHaveLength(0)

    // Confirm (as the owner) position 0 is still marked from the prior test's row.
    const cell = await owner.client
      .from('player_card_cells')
      .select('is_marked')
      .eq('player_card_id', pcId)
      .eq('position', 0)
      .single()
    expect(cell.data!.is_marked).toBe(true)

    // The intruder also cannot read the owner's player_cards row.
    const pcRead = await intruder.client
      .from('player_cards')
      .select('id')
      .eq('id', pcId)
    expect(pcRead.data ?? []).toHaveLength(0)
  })

  it('the leaderboard view reflects the counters for a group member', async () => {
    const pcId = await materializeOwnerCard()
    // Guarantee row-0 is complete so bingo_count = 1.
    for (let position = 0; position < GRID; position++) {
      await owner.client
        .from('player_card_cells')
        .update({ is_marked: true, marked_at: new Date().toISOString() })
        .eq('player_card_id', pcId)
        .eq('position', position)
    }

    const lb = await owner.client
      .from('leaderboard')
      .select('user_id, bingo_count, marks_count, points_total, first_bingo_at')
      .eq('card_id', cardId)
    expect(lb.error).toBeNull()
    const mine = lb.data!.find((r) => r.user_id === owner.id)
    expect(mine).toBeTruthy()
    expect(mine!.bingo_count).toBe(1)
    // 5 row cells + free center = 6 marked
    expect(mine!.marks_count).toBe(6)
    expect(mine!.first_bingo_at).not.toBeNull()
    // points = sum of challenge points on the 5 marked non-free row cells.
    // Row-0 maps challengeIds[0..4] with points 1..5 (free center adds 0).
    expect(mine!.points_total).toBe(1 + 2 + 3 + 4 + 5)

    // A non-member cannot see the group's standings (security_invoker respects RLS).
    const nonMember = await intruder.client
      .from('leaderboard')
      .select('user_id')
      .eq('card_id', cardId)
    expect(nonMember.data ?? []).toHaveLength(0)
  })
})
