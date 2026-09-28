import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  admin,
  anonClient,
  deleteTestUsers,
  hasServiceRole,
  type TestUser,
} from '@/test/helpers/supabase'

/**
 * Profile integration tests (U2 updateProfile / U3 uploadAvatar, D3 email confirmation).
 *
 * These exercise the DATABASE behavior the Server Actions rely on, AS real users, so RLS
 * applies. We do NOT import the Action functions; we replicate their Supabase calls as the
 * authed user (per test-conventions.md). The whole suite skips without the service-role key.
 */

// Users/resources created during the run, torn down in afterAll.
const createdUserIds: string[] = []

// A tiny valid PNG (1x1 transparent) used for avatar-storage RLS checks.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

describe.skipIf(!hasServiceRole)('profile (integration)', () => {
  afterAll(async () => {
    await deleteTestUsers(...createdUserIds)
  })

  it('lets a user update their OWN profile (username + name)', async () => {
    const A = await createTestUser('User A')
    createdUserIds.push(A.id)

    const username = `a_${randomUUID().slice(0, 8)}`
    const { error } = await A.client
      .from('profiles')
      .update({ username, name: 'Renamed A' })
      .eq('id', A.id)
    expect(error).toBeNull()

    // Verify the row actually changed (read own profile under RLS).
    const { data, error: readErr } = await A.client
      .from('profiles')
      .select('id, username, name')
      .eq('id', A.id)
      .single()
    expect(readErr).toBeNull()
    expect(data?.username).toBe(username)
    expect(data?.name).toBe('Renamed A')
  })

  it("does NOT let a user update another user's profile (RLS: update self only)", async () => {
    const A = await createTestUser('User A2')
    const B = await createTestUser('User B2')
    createdUserIds.push(A.id, B.id)

    // Snapshot B's current profile (read via admin to bypass RLS visibility).
    const { data: before } = await admin()
      .from('profiles')
      .select('username, name')
      .eq('id', B.id)
      .single()
    expect(before).not.toBeNull()

    // A attempts to update B's row. RLS should match zero rows -> no error, 0 affected.
    const attacked = `pwned_${randomUUID().slice(0, 8)}`
    const { data: updated, error } = await A.client
      .from('profiles')
      .update({ username: attacked, name: 'HACKED' })
      .eq('id', B.id)
      .select()
    // RLS silently filters the row out: no rows returned, and no rows changed.
    expect(error).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    // Confirm B is unchanged (authoritative read via admin).
    const { data: after } = await admin()
      .from('profiles')
      .select('username, name')
      .eq('id', B.id)
      .single()
    expect(after?.username).toBe(before?.username)
    expect(after?.name).toBe(before?.name)
    expect(after?.username).not.toBe(attacked)
    expect(after?.name).not.toBe('HACKED')
  })

  it('enforces case-insensitive username uniqueness (daniel vs Daniel -> 23505)', async () => {
    const A = await createTestUser('User A3')
    const B = await createTestUser('User B3')
    createdUserIds.push(A.id, B.id)

    // Unique base to avoid collisions with other test runs.
    const base = `daniel${randomUUID().slice(0, 6)}`
    const lower = base.toLowerCase()
    const mixed = lower.charAt(0).toUpperCase() + lower.slice(1)

    const { error: aErr } = await A.client
      .from('profiles')
      .update({ username: lower })
      .eq('id', A.id)
    expect(aErr).toBeNull()

    // B tries the same username with different case -> must collide.
    const { error: bErr } = await B.client
      .from('profiles')
      .update({ username: mixed })
      .eq('id', B.id)
    expect(bErr).not.toBeNull()
    expect(bErr?.code).toBe('23505')
  })

  it('avatar storage RLS: a user may write only their own avatars/{uid}/ folder', async () => {
    const A = await createTestUser('User A4')
    const B = await createTestUser('User B4')
    createdUserIds.push(A.id, B.id)

    // A uploads to its own folder -> allowed.
    const ownPath = `${A.id}/x.png`
    const own = await A.client.storage
      .from('avatars')
      .upload(ownPath, PNG_1x1, { contentType: 'image/png', upsert: true })
    expect(own.error).toBeNull()
    expect(own.data?.path).toBeTruthy()

    // A uploads into B's folder -> denied by Storage RLS.
    const foreignPath = `${B.id}/x.png`
    const foreign = await A.client.storage
      .from('avatars')
      .upload(foreignPath, PNG_1x1, { contentType: 'image/png', upsert: true })
    expect(foreign.error).not.toBeNull()
    expect(foreign.data).toBeNull()

    // Cleanup uploaded object (best-effort; deleting the user does not purge storage).
    await admin().storage.from('avatars').remove([ownPath])
  })

  it('email confirmation (D3): an unconfirmed account cannot sign in', async () => {
    const email = `unconfirmed_${randomUUID()}@example.test`
    const password = 'Test1234!pw'

    const { data, error: createErr } = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    })
    expect(createErr).toBeNull()
    expect(data.user?.id).toBeTruthy()
    if (data.user?.id) createdUserIds.push(data.user.id)

    // A fresh anon client attempts password sign-in before confirmation -> rejected.
    const { data: signIn, error: signInErr } = await anonClient().auth.signInWithPassword({
      email,
      password,
    })
    expect(signInErr).not.toBeNull()
    expect(signInErr?.code ?? signInErr?.message).toMatch(/email.?not.?confirmed/i)
    expect(signIn.session).toBeNull()
  })
})
