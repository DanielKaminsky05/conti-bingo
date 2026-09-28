import { describe, it, expect, afterAll } from 'vitest'
import {
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Integration tests for the Cards bucket (C1–C8) — the DATABASE behavior the card
 * endpoints rely on, exercised AS real users so RLS/constraints apply.
 *
 * Contract sources: api-endpoints.md C1/C2/C5/C7, data-model.md §3 (cards/challenges),
 * decisions.md D2 (SELECT-only client, admin/owner writes), D6 (even-grid free_space),
 * D7 (drafts). Verified against the live schema:
 *   - cards/challenges write RLS gated on private.is_group_admin (owner/admin only)
 *   - cards SELECT hides status='draft' from non-admin members
 *   - partial unique index one_active_card_per_group (group_id) WHERE status='active'
 *   - CHECK (free_space=false OR grid_size % 2 = 1)
 *
 * Skips cleanly when SUPABASE_SERVICE_ROLE_KEY is absent.
 */

// A Postgres error string that PostgREST uses when RLS blocks a write.
const RLS_CODE = '42501'

/** Build `n` challenge rows for a card. */
function challengeRows(cardId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    card_id: cardId,
    text: `challenge ${i + 1}`,
    points: 1,
    sort_index: i,
  }))
}

describe.skipIf(!hasServiceRole)('cards (integration)', () => {
  const createdUsers: string[] = []

  /**
   * Provision a group with an owner and (optionally) a plain member.
   * Owner is created via the create_group RPC (SECURITY DEFINER, sets role='owner').
   * Member joins via join_group RPC using the group's join_code.
   */
  async function setupGroup(withMember = true): Promise<{
    owner: TestUser
    member: TestUser | null
    groupId: string
  }> {
    const owner = await createTestUser('Card Owner')
    createdUsers.push(owner.id)

    const { data: groupData, error: gErr } = await owner.client
      .rpc('create_group', { p_name: `Cards Group ${owner.id.slice(0, 8)}` })
    expect(gErr, gErr?.message).toBeNull()
    expect(groupData).toBeTruthy()
    const group = groupData as unknown as { id: string; join_code: string }
    const groupId = group.id

    let member: TestUser | null = null
    if (withMember) {
      member = await createTestUser('Plain Member')
      createdUsers.push(member.id)
      const { error: jErr } = await member.client.rpc('join_group', {
        p_code: group.join_code,
      })
      expect(jErr, jErr?.message).toBeNull()
    }

    return { owner, member, groupId }
  }

  /** Insert a draft card as the owner and return its id. */
  async function insertDraftCard(
    owner: TestUser,
    groupId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return owner.client
      .from('cards')
      .insert({
        group_id: groupId,
        title: 'Lecture Bingo',
        grid_size: 5,
        layout_mode: 'shuffled',
        free_space: true,
        win_condition: 'line',
        status: 'draft',
        ...overrides,
      })
      .select()
      .single()
  }

  it('owner can insert a draft card + challenges; a plain member cannot (RLS)', async () => {
    const { owner, member, groupId } = await setupGroup()

    // Owner: insert card + challenges succeeds.
    const { data: card, error: cErr } = await insertDraftCard(owner, groupId)
    expect(cErr, cErr?.message).toBeNull()
    expect(card).toBeTruthy()
    expect(card!.status).toBe('draft')

    const { error: chErr } = await owner.client
      .from('challenges')
      .insert(challengeRows(card!.id, 24))
    expect(chErr, chErr?.message).toBeNull()

    const { count } = await owner.client
      .from('challenges')
      .select('*', { count: 'exact', head: true })
      .eq('card_id', card!.id)
    expect(count).toBe(24)

    // Member: inserting a card into the same group is blocked by RLS.
    const { data: memberCard, error: memberErr } = await member!.client
      .from('cards')
      .insert({
        group_id: groupId,
        title: 'Sneaky Card',
        grid_size: 5,
        layout_mode: 'shuffled',
        free_space: true,
        win_condition: 'line',
        status: 'draft',
      })
      .select()
      .single()
    expect(memberCard).toBeNull()
    expect(memberErr).toBeTruthy()
    expect(memberErr!.code).toBe(RLS_CODE)
  })

  it('publish flow: archive current active then activate a draft — exactly one active per group', async () => {
    const { owner, groupId } = await setupGroup(false)

    // First active card (simulates an already-published card).
    const { data: first, error: firstErr } = await insertDraftCard(owner, groupId, {
      title: 'Card One',
      status: 'active',
    })
    expect(firstErr, firstErr?.message).toBeNull()

    // A second draft awaiting publish.
    const { data: draft, error: draftErr } = await insertDraftCard(owner, groupId, {
      title: 'Card Two',
    })
    expect(draftErr, draftErr?.message).toBeNull()

    // Activating the draft WITHOUT archiving the first must violate the partial unique.
    const { error: dupErr } = await owner.client
      .from('cards')
      .update({ status: 'active' })
      .eq('id', draft!.id)
    expect(dupErr, 'a second active card must be rejected').toBeTruthy()
    expect(dupErr!.code).toBe('23505') // unique_violation

    // Publish flow: archive the current active, then activate the draft.
    const { error: archErr } = await owner.client
      .from('cards')
      .update({ status: 'archived' })
      .eq('id', first!.id)
    expect(archErr, archErr?.message).toBeNull()

    const { error: actErr } = await owner.client
      .from('cards')
      .update({ status: 'active' })
      .eq('id', draft!.id)
    expect(actErr, actErr?.message).toBeNull()

    // Exactly one active card remains for the group, and it's the newly published one.
    const { data: actives, error: listErr } = await owner.client
      .from('cards')
      .select('id')
      .eq('group_id', groupId)
      .eq('status', 'active')
    expect(listErr, listErr?.message).toBeNull()
    expect(actives).toHaveLength(1)
    expect(actives![0].id).toBe(draft!.id)
  })

  it('drafts are hidden from members via RLS; the owner sees them (C8/C2 visibility)', async () => {
    const { owner, member, groupId } = await setupGroup()

    // Owner authors one draft and one active card.
    const { data: draft } = await insertDraftCard(owner, groupId, { title: 'Hidden Draft' })
    const { data: active } = await insertDraftCard(owner, groupId, {
      title: 'Visible Active',
      status: 'active',
    })
    expect(draft).toBeTruthy()
    expect(active).toBeTruthy()

    // Member: SELECT returns only the non-draft (active) card.
    const { data: memberCards, error: mErr } = await member!.client
      .from('cards')
      .select('id,status')
      .eq('group_id', groupId)
    expect(mErr, mErr?.message).toBeNull()
    const memberIds = (memberCards ?? []).map((c) => c.id)
    expect(memberIds).toContain(active!.id)
    expect(memberIds).not.toContain(draft!.id)
    expect((memberCards ?? []).every((c) => c.status !== 'draft')).toBe(true)

    // Owner: SELECT returns both, including the draft.
    const { data: ownerCards, error: oErr } = await owner.client
      .from('cards')
      .select('id,status')
      .eq('group_id', groupId)
    expect(oErr, oErr?.message).toBeNull()
    const ownerIds = (ownerCards ?? []).map((c) => c.id)
    expect(ownerIds).toContain(draft!.id)
    expect(ownerIds).toContain(active!.id)
  })

  it('getActiveCard / listArchivedCards select behavior (C2/C5)', async () => {
    const { owner, member, groupId } = await setupGroup()

    const { data: archived } = await insertDraftCard(owner, groupId, {
      title: 'Old Card',
      status: 'archived',
    })
    const { data: active } = await insertDraftCard(owner, groupId, {
      title: 'Current Card',
      status: 'active',
    })
    expect(archived).toBeTruthy()
    expect(active).toBeTruthy()

    // getActiveCard: the group's single active card, visible to a member.
    const { data: activeRow, error: aErr } = await member!.client
      .from('cards')
      .select('id,title,status')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .single()
    expect(aErr, aErr?.message).toBeNull()
    expect(activeRow!.id).toBe(active!.id)
    expect(activeRow!.title).toBe('Current Card')

    // listArchivedCards: history, visible to a member.
    const { data: archivedRows, error: arErr } = await member!.client
      .from('cards')
      .select('id,status')
      .eq('group_id', groupId)
      .eq('status', 'archived')
    expect(arErr, arErr?.message).toBeNull()
    expect(archivedRows).toHaveLength(1)
    expect(archivedRows![0].id).toBe(archived!.id)
  })

  it('even-grid free_space is rejected by the DB CHECK (D6)', async () => {
    const { owner, groupId } = await setupGroup(false)

    const { data, error } = await insertDraftCard(owner, groupId, {
      title: 'Bad Even Grid',
      grid_size: 4,
      free_space: true,
    })
    expect(data).toBeNull()
    expect(error, 'free_space true on a 4×4 grid must violate the CHECK').toBeTruthy()
    expect(error!.code).toBe('23514') // check_violation
  })

  afterAll(async () => {
    await deleteTestUsers(...createdUsers)
  })
})
