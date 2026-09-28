import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import type { Tables } from '@/lib/supabase/database.types'

type Group = Tables<'groups'>

export type MemberWithProfile = {
  user_id: string
  role: Tables<'group_members'>['role']
  nickname: string | null
  joined_at: string
  profile: Pick<Tables<'profiles'>, 'id' | 'username' | 'name' | 'avatar_path'> | null
}

/** G2 — group details (RLS: members only). */
export async function getGroup(groupId: string): Promise<Group> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('groups').select('*').eq('id', groupId).single()
  if (error || !data) {
    throw new ActionError('not_found', 'Group not found.')
  }
  return data
}

/** G3 — groups the current user owns or belongs to. */
export async function listMyGroups(): Promise<Group[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('group_members')
    .select('groups(*)')
    .order('joined_at', { ascending: false })
  if (error) {
    throw new ActionError('error', error.message)
  }
  return (data ?? [])
    .map((row) => row.groups as Group | null)
    .filter((g): g is Group => g !== null)
}

/** G8 — group roster with profile info for display (RLS: members only). */
export async function listMembers(groupId: string): Promise<MemberWithProfile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, nickname, joined_at, profiles(id, username, name, avatar_path)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
  if (error) {
    throw new ActionError('error', error.message)
  }
  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    nickname: row.nickname,
    joined_at: row.joined_at,
    profile: (row.profiles as MemberWithProfile['profile']) ?? null,
  }))
}
