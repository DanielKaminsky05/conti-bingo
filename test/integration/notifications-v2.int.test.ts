import { describe, it, expect, afterAll } from 'vitest'
import {
  admin,
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'
import type { Enums } from '@/lib/supabase/database.types'

/**
 * Integration tests for migration 21 (fuller notification system):
 *  - payloads carry display names (actor_name / group_name / card_title)
 *  - bingo_achieved fires on a player's FIRST bingo only, and is retracted when
 *    their last bingo on the card is revoked (D4)
 *  - out_bingoed notifies the leader when someone goes strictly ahead; retracted
 *    if that bingo is revoked
 *  - card_published / card_replaced via the publish_card RPC
 *  - invite_received for an existing account; removed when the invite is revoked
 *
 * Play-state setup uses the service-role client; every assertion reads AS the
 * recipient so RLS confirms genuine delivery.
 */

const createdUserIds: string[] = []
const GRID = 4

async function newUser(name: string): Promise<TestUser> {
  const u = await createTestUser(name)
  createdUserIds.push(u.id)
  return u
}

afterAll(async () => {
  if (createdUserIds.length) await deleteTestUsers(...createdUserIds)
})

async function groupWith(owner: TestUser, ...members: TestUser[]) {
  const { data: group, error } = await owner.client.rpc('create_group', {
    p_name: `notif-v2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  })
  expect(error).toBeNull()
  for (const m of members) {
    const { error: joinErr } = await m.client.rpc('join_group', { p_code: group!.join_code })
    expect(joinErr).toBeNull()
  }
  return group!
}

/** Active 4×4 line card, no free space (identical layout: position === sort_index). */
async function activeCard(groupId: string, ownerId: string, title = 'Notif Card') {
  const a = admin()
  const { data: card, error } = await a
    .from('cards')
    .insert({
      group_id: groupId,
      title,
      grid_size: GRID,
      layout_mode: 'identical',
      free_space: false,
      win_condition: 'line',
      status: 'active',
      created_by: ownerId,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  const { data: challenges, error: chErr } = await a
    .from('challenges')
    .insert(
      Array.from({ length: GRID * GRID }, (_, i) => ({
        card_id: card!.id,
        text: `Challenge ${i}`,
        points: 1,
        sort_index: i,
      }))
    )
    .select('id, sort_index')
  expect(chErr).toBeNull()
  return { cardId: card!.id, challenges: [...challenges!].sort((x, y) => x.sort_index - y.sort_index) }
}

async function playerCard(
  cardId: string,
  userId: string,
  challenges: { id: string }[]
): Promise<string> {
  const a = admin()
  const { data: pc, error } = await a
    .from('player_cards')
    .insert({ card_id: cardId, user_id: userId })
    .select('id')
    .single()
  expect(error).toBeNull()
  const { error: cellErr } = await a.from('player_card_cells').insert(
    challenges.map((c, position) => ({
      player_card_id: pc!.id,
      position,
      challenge_id: c.id,
      is_marked: false,
    }))
  )
  expect(cellErr).toBeNull()
  return pc!.id
}

async function setMarked(playerCardId: string, positions: number[], marked: boolean) {
  const a = admin()
  for (const position of positions) {
    const { error } = await a
      .from('player_card_cells')
      .update({ is_marked: marked, marked_at: marked ? new Date().toISOString() : null })
      .eq('player_card_id', playerCardId)
      .eq('position', position)
    expect(error).toBeNull()
  }
}

const row = (r: number) => Array.from({ length: GRID }, (_, i) => r * GRID + i)

async function notesOf(user: TestUser, groupId: string, type: Enums<'notification_type'>) {
  const { data, error } = await user.client
    .from('notifications')
    .select('id, type, user_id, payload')
    .eq('group_id', groupId)
    .eq('type', type)
  expect(error).toBeNull()
  return data ?? []
}

function payload(n: { payload: unknown }): Record<string, unknown> {
  return (n.payload ?? {}) as Record<string, unknown>
}

describe.skipIf(!hasServiceRole)('Notifications v2 (integration)', () => {
  it('member_joined carries the joiner name and group name', async () => {
    const owner = await newUser('Owner Names')
    const joiner = await newUser('Joiner Names')
    const group = await groupWith(owner, joiner)

    const notes = await notesOf(owner, group.id, 'member_joined')
    expect(notes).toHaveLength(1)
    expect(payload(notes[0]).actor_name).toBe('Joiner Names')
    expect(payload(notes[0]).group_name).toBe(group.name)
  })

  it('bingo_achieved: only the first bingo notifies; retracted when the last bingo is revoked', async () => {
    const owner = await newUser('Owner First')
    const winner = await newUser('Winner First')
    const bystander = await newUser('Bystander First')
    const group = await groupWith(owner, winner, bystander)
    const { cardId, challenges } = await activeCard(group.id, owner.id, 'First Card')
    const pc = await playerCard(cardId, winner.id, challenges)

    await setMarked(pc, row(0), true) // bingo #1 → notify
    await setMarked(pc, row(1), true) // bingo #2 → quiet

    let notes = await notesOf(bystander, group.id, 'bingo_achieved')
    expect(notes).toHaveLength(1)
    expect(payload(notes[0]).actor_name).toBe('Winner First')
    expect(payload(notes[0]).card_title).toBe('First Card')
    expect(payload(notes[0]).group_name).toBe(group.name)
    expect(await notesOf(winner, group.id, 'bingo_achieved')).toEqual([])

    // Break row 0 — still holds row 1, so the notification stands.
    await setMarked(pc, [0], false)
    notes = await notesOf(bystander, group.id, 'bingo_achieved')
    expect(notes).toHaveLength(1)

    // Break row 1 too — no bingos left → retracted.
    await setMarked(pc, [GRID], false)
    expect(await notesOf(bystander, group.id, 'bingo_achieved')).toEqual([])
    expect(await notesOf(owner, group.id, 'bingo_achieved')).toEqual([])
  })

  it('out_bingoed: the leader is notified when overtaken (not on a tie); retracted on revoke', async () => {
    const owner = await newUser('Owner Lead')
    const leader = await newUser('Leader Lead')
    const challenger = await newUser('Challenger Lead')
    const group = await groupWith(owner, leader, challenger)
    const { cardId, challenges } = await activeCard(group.id, owner.id)
    const leaderPc = await playerCard(cardId, leader.id, challenges)
    const challengerPc = await playerCard(cardId, challenger.id, challenges)

    await setMarked(leaderPc, row(0), true) // leader: 1
    await setMarked(challengerPc, row(0), true) // challenger: 1 — tie, no lead change
    expect(await notesOf(leader, group.id, 'out_bingoed')).toEqual([])

    await setMarked(challengerPc, row(1), true) // challenger: 2 — strictly ahead
    const notes = await notesOf(leader, group.id, 'out_bingoed')
    expect(notes).toHaveLength(1)
    expect(payload(notes[0]).actor_name).toBe('Challenger Lead')
    expect(await notesOf(challenger, group.id, 'out_bingoed')).toEqual([])
    expect(await notesOf(owner, group.id, 'out_bingoed')).toEqual([]) // owner has no card

    // Challenger unmarks the bingo that took the lead → retracted.
    await setMarked(challengerPc, [GRID], false)
    expect(await notesOf(leader, group.id, 'out_bingoed')).toEqual([])
  })

  it('card_published then card_replaced via publish_card; the publisher is not notified', async () => {
    const owner = await newUser('Owner Publish')
    const member = await newUser('Member Publish')
    const group = await groupWith(owner, member)

    const draft = async (title: string) => {
      const { data, error } = await owner.client
        .from('cards')
        .insert({
          group_id: group.id,
          title,
          grid_size: GRID,
          layout_mode: 'identical',
          free_space: false,
          win_condition: 'line',
          created_by: owner.id,
        })
        .select('id')
        .single()
      expect(error).toBeNull()
      return data!.id
    }

    const first = await draft('Card One')
    expect((await owner.client.rpc('publish_card', { p_card_id: first })).error).toBeNull()
    const published = await notesOf(member, group.id, 'card_published')
    expect(published).toHaveLength(1)
    expect(payload(published[0]).card_title).toBe('Card One')
    expect(payload(published[0]).actor_name).toBe('Owner Publish')
    expect(await notesOf(member, group.id, 'card_replaced')).toEqual([])

    const second = await draft('Card Two')
    expect((await owner.client.rpc('publish_card', { p_card_id: second })).error).toBeNull()
    const replaced = await notesOf(member, group.id, 'card_replaced')
    expect(replaced).toHaveLength(1)
    expect(payload(replaced[0]).card_title).toBe('Card Two')
    expect(await notesOf(member, group.id, 'card_published')).toHaveLength(1) // unchanged

    expect(await notesOf(owner, group.id, 'card_published')).toEqual([])
    expect(await notesOf(owner, group.id, 'card_replaced')).toEqual([])
  })

  it('invite_received: an existing account is notified; revoking the invite removes it', async () => {
    const owner = await newUser('Owner Invite')
    const invitee = await newUser('Invitee Invite')
    const group = await groupWith(owner)

    const { data: invite, error } = await owner.client
      .from('invites')
      .insert({
        group_id: group.id,
        email: invitee.email.toUpperCase(), // matched case-insensitively
        token: crypto.randomUUID(),
        role: 'member',
        invited_by: owner.id,
      })
      .select('id, token')
      .single()
    expect(error).toBeNull()

    const notes = await notesOf(invitee, group.id, 'invite_received')
    expect(notes).toHaveLength(1)
    expect(payload(notes[0]).token).toBe(invite!.token)
    expect(payload(notes[0]).group_name).toBe(group.name)
    expect(payload(notes[0]).actor_name).toBe('Owner Invite')

    const { error: revokeErr } = await owner.client
      .from('invites')
      .update({ status: 'revoked' })
      .eq('id', invite!.id)
    expect(revokeErr).toBeNull()
    expect(await notesOf(invitee, group.id, 'invite_received')).toEqual([])
  })

  it('invite_received: no notification for an email with no account', async () => {
    const owner = await newUser('Owner NoAcct')
    const group = await groupWith(owner)
    const { error } = await owner.client.from('invites').insert({
      group_id: group.id,
      email: `nobody_${crypto.randomUUID()}@example.test`,
      token: crypto.randomUUID(),
      role: 'member',
      invited_by: owner.id,
    })
    expect(error).toBeNull()

    const { count } = await admin()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .eq('type', 'invite_received')
    expect(count).toBe(0)
  })
})
