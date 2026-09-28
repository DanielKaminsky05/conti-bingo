import { describe, it, expect, afterAll } from 'vitest'
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Integration tests for Notifications (N1/N2, N3-adjacent RLS) against the REAL database.
 *
 * Covers the DB behavior the endpoints rely on (data-model.md §3/§9):
 *  - RLS: a user reads/updates ONLY their own notifications; cannot read/update another's;
 *    a client CANNOT insert a notification directly (server-side/trigger only).
 *  - Trigger `notify_member_joined`: owner receives a `member_joined` notification when a
 *    new member joins their group (via `join_group`).
 *  - `markNotificationRead` behavior: recipient sets `read_at` on one / all of their own rows;
 *    cannot mark another user's.
 *  - (Optional) Trigger `notify_bingo`: recording a bingo notifies other group members.
 *
 * Skips cleanly when the service-role key is absent. Cleans up its own users in afterAll
 * (cascades remove groups/memberships/notifications).
 */

const createdUserIds: string[] = []

async function newUser(name: string): Promise<TestUser> {
  const u = await createTestUser(name)
  createdUserIds.push(u.id)
  return u
}

afterAll(async () => {
  if (createdUserIds.length) await deleteTestUsers(...createdUserIds)
})

describe.skipIf(!hasServiceRole)('Notifications (integration)', () => {
  it('owner receives a member_joined notification when someone joins (trigger notify_member_joined)', async () => {
    const owner = await newUser('Owner A')
    const joiner = await newUser('Joiner B')

    // Owner creates a group via the SECURITY DEFINER RPC.
    const { data: group, error: createErr } = await owner.client.rpc('create_group', {
      p_name: `notif-join-${Date.now()}`,
    })
    expect(createErr).toBeNull()
    expect(group?.id).toBeTruthy()
    const groupId = group!.id
    const joinCode = group!.join_code

    // Joiner joins with the code.
    const { error: joinErr } = await joiner.client.rpc('join_group', { p_code: joinCode })
    expect(joinErr).toBeNull()

    // Owner should now see a member_joined notification for this group (queried AS the owner,
    // so RLS confirms it's genuinely theirs).
    const { data: notes, error: readErr } = await owner.client
      .from('notifications')
      .select('id, type, group_id, user_id, read_at')
      .eq('group_id', groupId)
      .eq('type', 'member_joined')

    expect(readErr).toBeNull()
    expect(Array.isArray(notes)).toBe(true)
    expect(notes!.length).toBeGreaterThanOrEqual(1)
    for (const n of notes!) {
      expect(n.user_id).toBe(owner.id) // recipient is the owner
      expect(n.type).toBe('member_joined')
      expect(n.read_at).toBeNull() // freshly created → unread
    }
  })

  it('RLS: a user cannot SELECT another user\'s notifications', async () => {
    const owner = await newUser('Owner Sel')
    const joiner = await newUser('Joiner Sel')
    const stranger = await newUser('Stranger Sel')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-sel-${Date.now()}`,
    })
    await joiner.client.rpc('join_group', { p_code: group!.join_code })

    // The owner has a member_joined notification. A stranger must not be able to read it.
    const { data: strangerView, error } = await stranger.client
      .from('notifications')
      .select('id')
      .eq('group_id', group!.id)

    expect(error).toBeNull() // RLS filters rows rather than erroring
    expect(strangerView ?? []).toEqual([]) // sees nothing

    // The joiner also should not see the owner's notification.
    const { data: joinerView } = await joiner.client
      .from('notifications')
      .select('id, user_id')
      .eq('user_id', owner.id)
    expect(joinerView ?? []).toEqual([])
  })

  it('RLS: a client CANNOT insert a notification directly', async () => {
    const user = await newUser('Insert Denied')

    const { data, error } = await user.client
      .from('notifications')
      .insert({ user_id: user.id, type: 'member_joined', payload: {} })
      .select()

    // Insert must be denied by RLS (no WITH CHECK policy for client inserts).
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    // Confirm nothing landed.
    const { data: after } = await user.client.from('notifications').select('id')
    expect(after ?? []).toEqual([])
  })

  it('RLS: a client cannot insert a notification targeting ANOTHER user', async () => {
    const attacker = await newUser('Attacker')
    const victim = await newUser('Victim')

    const { error } = await attacker.client
      .from('notifications')
      .insert({ user_id: victim.id, type: 'member_joined', payload: {} })
      .select()
    expect(error).not.toBeNull()

    // Victim's feed stays empty.
    const { data: victimView } = await victim.client.from('notifications').select('id')
    expect(victimView ?? []).toEqual([])
  })

  it('markNotificationRead: recipient can mark ONE of their own notifications read', async () => {
    const owner = await newUser('Owner Mark1')
    const joiner = await newUser('Joiner Mark1')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-mark1-${Date.now()}`,
    })
    await joiner.client.rpc('join_group', { p_code: group!.join_code })

    // Grab one unread notification belonging to the owner.
    const { data: before } = await owner.client
      .from('notifications')
      .select('id, read_at')
      .eq('group_id', group!.id)
      .is('read_at', null)
      .limit(1)
    expect(before!.length).toBe(1)
    const target = before![0]

    const marked = new Date().toISOString()
    const { data: updated, error: updErr } = await owner.client
      .from('notifications')
      .update({ read_at: marked })
      .eq('id', target.id)
      .select('id, read_at')

    expect(updErr).toBeNull()
    expect(updated!.length).toBe(1)
    expect(updated![0].read_at).not.toBeNull()
  })

  it('markNotificationRead: recipient can mark ALL of their own notifications read', async () => {
    const owner = await newUser('Owner MarkAll')
    const joinerB = await newUser('Joiner MarkAll B')
    const joinerC = await newUser('Joiner MarkAll C')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-markall-${Date.now()}`,
    })
    await joinerB.client.rpc('join_group', { p_code: group!.join_code })
    await joinerC.client.rpc('join_group', { p_code: group!.join_code })

    // "Mark all": clear every unread notification the owner has.
    const { error: allErr } = await owner.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .select('id')
    expect(allErr).toBeNull()

    const { data: stillUnread } = await owner.client
      .from('notifications')
      .select('id')
      .is('read_at', null)
    expect(stillUnread ?? []).toEqual([])
  })

  it('RLS: a user CANNOT mark another user\'s notification read', async () => {
    const owner = await newUser('Owner Victim')
    const joiner = await newUser('Joiner Actor')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-crossmark-${Date.now()}`,
    })
    await joiner.client.rpc('join_group', { p_code: group!.join_code })

    // Find the owner's notification id via the service-role client (setup only).
    const a = admin()
    const { data: ownerNotes } = await a
      .from('notifications')
      .select('id, read_at')
      .eq('user_id', owner.id)
      .eq('group_id', group!.id)
      .limit(1)
    expect(ownerNotes!.length).toBe(1)
    const noteId = ownerNotes![0].id

    // Joiner tries to mark the owner's notification read → RLS blocks (0 rows updated).
    const { data: updated } = await joiner.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', noteId)
      .select('id')
    expect(updated ?? []).toEqual([])

    // Verify via service-role that it is still unread.
    const { data: afterNote } = await a
      .from('notifications')
      .select('read_at')
      .eq('id', noteId)
      .single()
    expect(afterNote!.read_at).toBeNull()
  })

  it('RLS: an unauthenticated (anon) client reads no notifications', async () => {
    const owner = await newUser('Owner Anon')
    const joiner = await newUser('Joiner Anon')
    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-anon-${Date.now()}`,
    })
    await joiner.client.rpc('join_group', { p_code: group!.join_code })

    const anon = anonClient()
    const { data: anonView } = await anon.from('notifications').select('id')
    expect(anonView ?? []).toEqual([])
  })

  it('trigger notify_bingo: other group members are notified when a member hits a bingo', async () => {
    // Play-state setup uses the service-role client (setup only). We then assert the
    // notification as the affected member, so RLS confirms delivery is genuine.
    const owner = await newUser('Owner Bingo')
    const winner = await newUser('Winner Bingo')
    const bystander = await newUser('Bystander Bingo')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `notif-bingo-${Date.now()}`,
    })
    const groupId = group!.id
    await winner.client.rpc('join_group', { p_code: group!.join_code })
    await bystander.client.rpc('join_group', { p_code: group!.join_code })

    const a = admin()

    // 4x4 line card, no free space → completing one row (4 marks) is a bingo.
    const GRID = 4
    const { data: card, error: cardErr } = await a
      .from('cards')
      .insert({
        group_id: groupId,
        title: 'Bingo Card',
        grid_size: GRID,
        layout_mode: 'identical',
        free_space: false,
        win_condition: 'line',
        status: 'active',
        created_by: owner.id,
      })
      .select('id')
      .single()
    expect(cardErr).toBeNull()
    const cardId = card!.id

    // Challenges filling the whole grid, in order.
    const challengeRows = Array.from({ length: GRID * GRID }, (_, i) => ({
      card_id: cardId,
      text: `Challenge ${i}`,
      points: 1,
      sort_index: i,
    }))
    const { data: challenges, error: chErr } = await a
      .from('challenges')
      .insert(challengeRows)
      .select('id, sort_index')
    expect(chErr).toBeNull()
    const bySort = [...challenges!].sort((x, y) => x.sort_index - y.sort_index)

    // Build the winner's player card + cells (identical layout: position === sort_index).
    const { data: pc, error: pcErr } = await a
      .from('player_cards')
      .insert({ card_id: cardId, user_id: winner.id })
      .select('id')
      .single()
    expect(pcErr).toBeNull()
    const playerCardId = pc!.id

    const cellRows = bySort.map((c, position) => ({
      player_card_id: playerCardId,
      position,
      challenge_id: c.id,
      is_marked: false,
    }))
    const { error: cellErr } = await a.from('player_card_cells').insert(cellRows)
    expect(cellErr).toBeNull()

    // Mark the top row (positions 0..GRID-1) → check_bingo inserts a `line` bingo,
    // which fires notify_bingo for the other group members.
    for (let position = 0; position < GRID; position++) {
      const { error: markErr } = await a
        .from('player_card_cells')
        .update({ is_marked: true, marked_at: new Date().toISOString() })
        .eq('player_card_id', playerCardId)
        .eq('position', position)
      expect(markErr).toBeNull()
    }

    // A bingo row should now exist for the winner.
    const { data: bingos } = await a
      .from('bingos')
      .select('id, type, user_id')
      .eq('card_id', cardId)
    expect((bingos ?? []).length).toBeGreaterThanOrEqual(1)
    expect(bingos!.some((b) => b.user_id === winner.id)).toBe(true)

    // The bystander (a different group member) should receive a bingo_achieved notification,
    // readable AS themselves under RLS.
    const { data: bystanderNotes, error: readErr } = await bystander.client
      .from('notifications')
      .select('id, type, user_id, group_id')
      .eq('group_id', groupId)
      .eq('type', 'bingo_achieved')
    expect(readErr).toBeNull()
    expect((bystanderNotes ?? []).length).toBeGreaterThanOrEqual(1)
    for (const n of bystanderNotes!) {
      expect(n.user_id).toBe(bystander.id)
      expect(n.type).toBe('bingo_achieved')
    }

    // The winner is not spammed with their own bingo_achieved notification.
    const { data: winnerNotes } = await winner.client
      .from('notifications')
      .select('id')
      .eq('group_id', groupId)
      .eq('type', 'bingo_achieved')
    expect(winnerNotes ?? []).toEqual([])
  })
})
