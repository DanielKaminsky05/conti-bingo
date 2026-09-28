import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  admin,
  createTestUser,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Invitations integration tests. Covers `invites` RLS (owner/admin create,
 * members cannot) and the SECURITY DEFINER RPCs `accept_invite` /
 * `get_invite_preview`.
 */

const createdUserIds: string[] = []

async function newUser(name: string): Promise<TestUser> {
  const u = await createTestUser(name)
  createdUserIds.push(u.id)
  return u
}

function inviteToken(): string {
  return `tok_${randomUUID()}`
}

afterAll(async () => {
  if (createdUserIds.length) await deleteTestUsers(...createdUserIds)
})

describe.skipIf(!hasServiceRole)('invites (integration)', () => {
  it('lets an admin create an invite but blocks a plain member (RLS)', async () => {
    const owner = await newUser('Owner IA')
    const adminUser = await newUser('Admin IA')
    const member = await newUser('Member IA')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })
    await adminUser.client.rpc('join_group', { p_code: group!.join_code })
    await member.client.rpc('join_group', { p_code: group!.join_code })
    await owner.client
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', group!.id)
      .eq('user_id', adminUser.id)

    // Admin can create an invite.
    const adminInsert = await adminUser.client
      .from('invites')
      .insert({
        group_id: group!.id,
        token: inviteToken(),
        role: 'member',
        invited_by: adminUser.id,
      })
      .select('id, status')
    expect(adminInsert.error).toBeNull()
    expect(adminInsert.data).toHaveLength(1)
    expect(adminInsert.data![0].status).toBe('pending')

    // A plain member cannot create an invite (RLS WITH CHECK).
    const memberInsert = await member.client
      .from('invites')
      .insert({
        group_id: group!.id,
        token: inviteToken(),
        role: 'member',
        invited_by: member.id,
      })
      .select('id')
    expect(memberInsert.error).not.toBeNull()
  })

  it('accept_invite makes a second user a member with the invite role and marks it accepted', async () => {
    const owner = await newUser('Owner IB')
    const invitee = await newUser('Invitee IB')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })

    const token = inviteToken()
    const created = await owner.client
      .from('invites')
      .insert({ group_id: group!.id, token, role: 'admin', invited_by: owner.id })
      .select('id')
    expect(created.error).toBeNull()

    const accept = await invitee.client.rpc('accept_invite', { p_token: token })
    expect(accept.error).toBeNull()
    expect(accept.data!.id).toBe(group!.id)

    // Invitee is now a member with the invite's role (admin).
    const roleRow = await owner.client
      .from('group_members')
      .select('role')
      .eq('group_id', group!.id)
      .eq('user_id', invitee.id)
      .single()
    expect(roleRow.data!.role).toBe('admin')

    // Invite status flips to accepted (read via service role to avoid RLS ambiguity).
    const inviteRow = await admin()
      .from('invites')
      .select('status, accepted_by')
      .eq('token', token)
      .single()
    expect(inviteRow.data!.status).toBe('accepted')
    expect(inviteRow.data!.accepted_by).toBe(invitee.id)
  })

  it('rejects accept_invite for an expired invite', async () => {
    const owner = await newUser('Owner IC')
    const invitee = await newUser('Invitee IC')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })

    const token = inviteToken()
    // Insert via service role so we can set expires_at in the past.
    await admin()
      .from('invites')
      .insert({
        group_id: group!.id,
        token,
        role: 'member',
        invited_by: owner.id,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })

    const accept = await invitee.client.rpc('accept_invite', { p_token: token })
    expect(accept.error).not.toBeNull()

    const notMember = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', invitee.id)
    expect(notMember.data ?? []).toHaveLength(0)
  })

  it('rejects accept_invite for a revoked invite', async () => {
    const owner = await newUser('Owner ID')
    const invitee = await newUser('Invitee ID')

    const { data: group } = await owner.client.rpc('create_group', {
      p_name: `Group ${randomUUID()}`,
    })

    const token = inviteToken()
    await admin()
      .from('invites')
      .insert({
        group_id: group!.id,
        token,
        role: 'member',
        invited_by: owner.id,
        status: 'revoked',
      })

    const accept = await invitee.client.rpc('accept_invite', { p_token: token })
    expect(accept.error).not.toBeNull()

    const notMember = await owner.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
      .eq('user_id', invitee.id)
    expect(notMember.data ?? []).toHaveLength(0)
  })

  it('get_invite_preview returns minimal group info for a valid token and nothing for unknown, without leaking the roster', async () => {
    const owner = await newUser('Owner IE')
    const member = await newUser('Member IE')
    const outsider = await newUser('Outsider IE')

    const groupName = `Group ${randomUUID()}`
    const { data: group } = await owner.client.rpc('create_group', { p_name: groupName })
    await member.client.rpc('join_group', { p_code: group!.join_code })

    const token = inviteToken()
    await owner.client
      .from('invites')
      .insert({ group_id: group!.id, token, role: 'member', invited_by: owner.id })

    // A signed-in outsider can preview a valid token: minimal group info only.
    const preview = await outsider.client.rpc('get_invite_preview', { p_token: token })
    expect(preview.error).toBeNull()
    expect(preview.data).toHaveLength(1)
    const row = preview.data![0]
    expect(row.group_id).toBe(group!.id)
    expect(row.group_name).toBe(groupName)
    expect(row.role).toBe('member')

    // The preview must not expose the roster — no member ids/user data in the shape.
    expect(Object.keys(row)).not.toContain('user_id')
    expect(JSON.stringify(row)).not.toContain(member.id)
    expect(JSON.stringify(row)).not.toContain(owner.id)

    // Outsider still cannot read the actual roster directly (RLS).
    const roster = await outsider.client
      .from('group_members')
      .select('user_id')
      .eq('group_id', group!.id)
    expect(roster.data ?? []).toHaveLength(0)

    // Unknown token returns nothing.
    const unknown = await outsider.client.rpc('get_invite_preview', { p_token: inviteToken() })
    expect(unknown.error).toBeNull()
    expect(unknown.data ?? []).toHaveLength(0)
  })
})
