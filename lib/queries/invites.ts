import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import type { Database, Tables } from '@/lib/supabase/database.types'

type Invite = Tables<'invites'>
type InvitePreview = Database['public']['Functions']['get_invite_preview']['Returns'][number]

/** V2 — a group's invites (RLS: owner/admin). */
export async function listInvites(groupId: string): Promise<Invite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) {
    throw new ActionError('error', error.message)
  }
  return data ?? []
}

/**
 * V4 — public preview of an invite by token. Per the contract, expired/revoked/
 * unknown tokens are treated as "not found" (null); only a live, pending invite
 * previews. (The RPC returns the row for any status, so we filter here.)
 */
export async function getInviteByToken(token: string): Promise<InvitePreview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })
  if (error) {
    throw new ActionError('error', error.message)
  }
  const preview = data?.[0]
  if (!preview) return null
  if (preview.status !== 'pending') return null
  if (preview.expires_at && new Date(preview.expires_at).getTime() < Date.now()) return null
  return preview
}
