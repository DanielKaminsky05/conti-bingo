import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Integration-test helpers. These hit the REAL Supabase project, so they create
 * and delete their own throwaway users/rows. Requires in `.env.local`:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (secret — never commit).
 *
 * Integration tests should skip themselves when the service-role key is absent.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasServiceRole = Boolean(url && anonKey && serviceKey)

/** Service-role client (bypasses RLS). Setup/teardown only. */
export function admin(): SupabaseClient<Database> {
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY / URL for tests.')
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** An anon-key client that runs AS a signed-in user (so RLS applies). */
export function anonClient(): SupabaseClient<Database> {
  if (!url || !anonKey) throw new Error('Missing Supabase URL / publishable key for tests.')
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type TestUser = {
  id: string
  email: string
  password: string
  name: string
  client: SupabaseClient<Database>
}

/** Create a confirmed test user and return a client signed in as them. */
export async function createTestUser(name = 'Test User'): Promise<TestUser> {
  const email = `test_${randomUUID()}@example.test`
  const password = 'Test1234!pw'
  const a = admin()
  const { data, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error || !data.user) throw error ?? new Error('Failed to create test user')

  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  return { id: data.user.id, email, password, name, client }
}

/** Delete users (cascades to profiles, memberships, cards, etc.). */
export async function deleteTestUsers(...ids: string[]): Promise<void> {
  const a = admin()
  for (const id of ids) {
    await a.auth.admin.deleteUser(id).catch(() => undefined)
  }
}
