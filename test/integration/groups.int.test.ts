import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Groups + membership integration tests. Exercises the real DB via the
 * SECURITY DEFINER RPCs (`create_group`, `join_group`) and RLS on `groups`
 * and `group_members`, as authenticated users.
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

describe.skipIf(!hasServiceRole)('groups (integration)', () => {
  it('create_group creates the group, enrolls the caller as owner, and sets a join_code', async () => {
    const owner = await newUser('Owner A')
    const name = `Group ${randomUUID()}`

    const { data: group, error } = await owner.client.rpc('create_group', { p_name: name })
    expect(error).toBeNull()
    expect(group).toBeTruthy()
    expect(group!.name).toBe(name)
    expect(group!.host_id).toBe(owner.id)
    expect(group!.join_code).toBeTruthy()
    expect(group!.status).toBe('active')

    // Caller is the owner member row.
    const { data: members, error: mErr } = await owner.client
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', group!.id)
    expect(mErr).toBeNull()
    expect(members).toHaveLength(1)
    expect(members![0]).toMatchObject({ user_id: owner.id, role: 'owner' })
  })

  it('lets owner and members read the group + roster, but blocks non-members (RLS)', async () => {
    const owner = await newUser('Owner B')
    const member = await newUser('Member B')
    const outsider = await newUser('Outsider B')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    await member.client.rpc('join_group', { p_code: group!.join_code })

    // Owner reads group + members.
    const ownerGroup = await owner.client.from('groups').select('id').eq('id', group!.id).single()
    expect(ownerGroup.error).toBeNull()
    expect(ownerGroup.data!.id).toBe(group!.id)

    // Member reads group + members.
    const memberGroup = await member.client
      .from('groups')
      .select('id')
      .eq('id', group!.id)
      .single()
    expect(memberGroup.error).toBeNull()
    const memberRoster = await member.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
    expect(memberRoster.data).toHaveLength(2)

    // Non-member sees nothing (RLS returns zero rows, not an error).
    const outsiderGroup = await outsider.client
      .from('groups')
      .select('id')
      .eq('id', group!.id)
      .maybeSingle()
    expect(outsiderGroup.data).toBeNull()
    const outsiderRoster = await outsider.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
    expect(outsiderRoster.data ?? []).toHaveLength(0)
  })

  it('lets the owner promote a member to admin, but a member cannot self-promote or edit the group', async () => {
    const owner = await newUser('Owner C')
    const member = await newUser('Member C')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    await member.client.rpc('join_group', { p_code: group!.join_code })

    // Owner promotes the member to admin.
    const promote = await owner.client
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', group!.id)
      .eq('user_id', member.id)
      .select('role')
    expect(promote.error).toBeNull()
    expect(promote.data).toHaveLength(1)
    expect(promote.data![0].role).toBe('admin')

    // A plain member cannot update the group (RLS: no rows affected).
    // Re-fetch a fresh member for a clean "member cannot edit" check.
    const plainMember = await newUser('Plain Member C')
    await plainMember.client.rpc('join_group', { p_code: group!.join_code })
    const memberEdit = await plainMember.client
      .from('groups')
      .update({ name: 'Hacked' })
      .eq('id', group!.id)
      .select('id')
    expect(memberEdit.data ?? []).toHaveLength(0)
    const afterEdit = await owner.client.from('groups').select('name').eq('id', group!.id).single()
    expect(afterEdit.data!.name).not.toBe('Hacked')

    // A member cannot self-promote (update own role is blocked / no-op).
    await plainMember.client
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', group!.id)
      .eq('user_id', plainMember.id)
    const selfRole = await owner.client
      .from('group_members')
      .select('role')
      .eq('group_id', group!.id)
      .eq('user_id', plainMember.id)
      .single()
    expect(selfRole.data!.role).toBe('member')
  })

  it('lets the owner delete the group, but an admin cannot', async () => {
    const owner = await newUser('Owner D')
    const admin2 = await newUser('Admin D')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    await admin2.client.rpc('join_group', { p_code: group!.join_code })
    await owner.client
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', group!.id)
      .eq('user_id', admin2.id)

    // Admin cannot delete (RLS: no rows deleted).
    await admin2.client.from('groups').delete().eq('id', group!.id)
    const stillThere = await owner.client
      .from('groups')
      .select('id')
      .eq('id', group!.id)
      .maybeSingle()
    expect(stillThere.data!.id).toBe(group!.id)

    // Owner can delete.
    await owner.client.from('groups').delete().eq('id', group!.id)
    const gone = await admin().from('groups').select('id').eq('id', group!.id).maybeSingle()
    expect(gone.data).toBeNull()
  })

  it('join_group adds a member for a valid code, rejects invalid codes, and does not duplicate on re-join', async () => {
    const owner = await newUser('Owner E')
    const joiner = await newUser('Joiner E')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })

    // Valid code -> member.
    const joined = await joiner.client.rpc('join_group', { p_code: group!.join_code })
    expect(joined.error).toBeNull()
    expect(joined.data!.id).toBe(group!.id)
    const roleRow = await owner.client
      .from('group_members')
      .select('role')
      .eq('group_id', group!.id)
      .eq('user_id', joiner.id)
      .single()
    expect(roleRow.data!.role).toBe('member')

    // Re-joining is idempotent — no duplicate membership row.
    await joiner.client.rpc('join_group', { p_code: group!.join_code })
    const rows = await owner.client
      .from('group_members')
      .select('id')
      .eq('group_id', group!.id)
      .eq('user_id', joiner.id)
    expect(rows.data).toHaveLength(1)

    // Invalid / unknown code errors.
    const bad = await joiner.client.rpc('join_group', { p_code: 'ZZZZZZ' })
    expect(bad.error).not.toBeNull()
  })

  it('blocks joining once join_locked is set true', async () => {
    const owner = await newUser('Owner F')
    const joiner = await newUser('Joiner F')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    const lock = await owner.client
      .from('groups')
      .update({ join_locked: true })
      .eq('id', group!.id)
      .select('join_locked')
    expect(lock.error).toBeNull()
    expect(lock.data![0].join_locked).toBe(true)

    const attempt = await joiner.client.rpc('join_group', { p_code: group!.join_code })
    expect(attempt.error).not.toBeNull()
    const notMember = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', joiner.id)
    expect(notMember.data ?? []).toHaveLength(0)
  })

  it('membership removal: member leaves self; admin removes a member; member cannot remove another; owner cannot leave', async () => {
    const owner = await newUser('Owner G')
    const admin2 = await newUser('Admin G')
    const m1 = await newUser('Member G1')
    const m2 = await newUser('Member G2')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    for (const u of [admin2, m1, m2]) {
      await u.client.rpc('join_group', { p_code: group!.join_code })
    }
    await owner.client
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', group!.id)
      .eq('user_id', admin2.id)

    // A member can delete their own membership.
    await m1.client
      .from('group_members')
      .delete()
      .eq('group_id', group!.id)
      .eq('user_id', m1.id)
    const m1Gone = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', m1.id)
    expect(m1Gone.data ?? []).toHaveLength(0)

    // A member cannot remove another member (RLS blocks; m2 stays).
    await m2.client
      .from('group_members')
      .delete()
      .eq('group_id', group!.id)
      .eq('user_id', admin2.id)
    const adminStays = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', admin2.id)
    expect(adminStays.data).toHaveLength(1)

    // An admin can remove a member.
    await admin2.client
      .from('group_members')
      .delete()
      .eq('group_id', group!.id)
      .eq('user_id', m2.id)
    const m2Gone = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', m2.id)
    expect(m2Gone.data ?? []).toHaveLength(0)

    // The owner cannot leave (blocked) — owner row survives the delete attempt.
    await owner.client
      .from('group_members')
      .delete()
      .eq('group_id', group!.id)
      .eq('user_id', owner.id)
    const ownerStays = await admin()
      .from('group_members')
      .select('role')
      .eq('group_id', group!.id)
      .eq('user_id', owner.id)
    expect(ownerStays.data).toHaveLength(1)
    expect(ownerStays.data![0].role).toBe('owner')
  })

  it('lets the owner set and read back background_path, but blocks a non-member (RLS)', async () => {
    const owner = await newUser('Owner H')
    const outsider = await newUser('Outsider H')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    const bgPath = `${group!.id}/${randomUUID()}-bg.jpg`

    // Owner can set the background path.
    const set = await owner.client
      .from('groups')
      .update({ background_path: bgPath })
      .eq('id', group!.id)
      .select('background_path')
      .single()
    expect(set.error).toBeNull()
    expect(set.data!.background_path).toBe(bgPath)

    // Read back via a fresh select.
    const readBack = await owner.client
      .from('groups')
      .select('background_path')
      .eq('id', group!.id)
      .single()
    expect(readBack.data!.background_path).toBe(bgPath)

    // A non-member cannot update it (RLS: no rows affected, value unchanged).
    const hacked = `${group!.id}/${randomUUID()}-hacked.jpg`
    const attempt = await outsider.client
      .from('groups')
      .update({ background_path: hacked })
      .eq('id', group!.id)
      .select('id')
    expect(attempt.data ?? []).toHaveLength(0)
    const after = await owner.client
      .from('groups')
      .select('background_path')
      .eq('id', group!.id)
      .single()
    expect(after.data!.background_path).toBe(bgPath)
  })

  it('rejects unauthenticated create_group (anon)', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('create_group', { p_name: `Group ${randomUUID()}` })
    expect(error).not.toBeNull()
  })
})
