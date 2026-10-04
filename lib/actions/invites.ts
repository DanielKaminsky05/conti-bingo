'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { ActionError, ok, fail, withResult, type ActionResult } from '@/lib/actions/result'
import {
  createInviteSchema,
  inviteIdSchema,
  tokenSchema,
  type CreateInviteInput,
} from '@/lib/validation/invites'
import type { Tables } from '@/lib/supabase/database.types'

type Invite = Tables<'invites'>
type Group = Tables<'groups'>

const DEFAULT_EXPIRES_HOURS = 168 // 7 days

/** V1 — create an email/link invite (RLS: owner/admin). Returns the invite incl. token. */
export async function createInvite(input: CreateInviteInput): Promise<ActionResult<Invite>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()
    const parsed = createInviteSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { groupId, email, role, expiresInHours } = parsed.data
    const token = crypto.randomUUID()
    const hours = expiresInHours ?? DEFAULT_EXPIRES_HOURS
    const expiresAt =
      hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null

    const { data, error } = await supabase
      .from('invites')
      .insert({
        group_id: groupId,
        email: email ?? null,
        token,
        role,
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select()
      .single()
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('error', 'Failed to create invite.')

    revalidatePath(`/groups/${groupId}`, 'layout')
    return data
  })
}

/** V3 — revoke a pending invite (RLS: owner/admin). */
export async function revokeInvite(input: { inviteId: string }): Promise<ActionResult<{ inviteId: string }>> {
  let ctx
  try {
    ctx = await requireUser()
  } catch (e) {
    if (e instanceof ActionError) return fail(e.code, e.message)
    throw e
  }
  const { supabase } = ctx
  const parsed = inviteIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }

  const { data, error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', parsed.data.inviteId)
    .select('group_id')
    .single()

  if (error) return fail('error', error.message)
  if (!data) return fail('not_found', 'Invite not found or not permitted.')

  revalidatePath(`/groups/${data.group_id}`, 'layout')
  return ok({ inviteId: parsed.data.inviteId })
}

/** V5 — accept an invite via token (RPC); become a member with the invited role. */
export async function acceptInvite(input: { token: string }): Promise<ActionResult<Group>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = tokenSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { data, error } = await supabase.rpc('accept_invite', { p_token: parsed.data.token })
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('not_found', 'Invite is invalid, expired, or revoked.')

    const group = data as Group
    revalidatePath('/')
    revalidatePath(`/groups/${group.id}`, 'layout')
    return group
  })
}
