import { createClient } from '@/lib/supabase/server'
import { ActionError } from '@/lib/actions/result'
import type { Tables } from '@/lib/supabase/database.types'

/**
 * Server read helpers for the Cards bucket (C2/C5/C6/C8). No `'use server'` —
 * these are plain async functions run in Server Components. Every read is
 * scoped by RLS (members read active/archived cards; only owner/admin see
 * drafts), so a blocked / missing row surfaces as `not_found`.
 */

export type CardRow = Tables<'cards'>
export type ChallengeRow = Tables<'challenges'>
export type CardWithChallenges = CardRow & { challenges: ChallengeRow[] }

/** C2 — the group's current active card plus its challenges (sorted). */
export async function getActiveCard(groupId: string): Promise<CardWithChallenges | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select('*, challenges(*)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('sort_index', { referencedTable: 'challenges', ascending: true })
    .maybeSingle()

  if (error) throw new ActionError('error', error.message)
  return data as CardWithChallenges | null
}

/** C6 — a specific card (draft/active/archived) with its challenges. */
export async function getCard(cardId: string): Promise<CardWithChallenges> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select('*, challenges(*)')
    .eq('id', cardId)
    .order('sort_index', { referencedTable: 'challenges', ascending: true })
    .maybeSingle()

  if (error) throw new ActionError('error', error.message)
  if (!data) throw new ActionError('not_found', 'Card not found.')
  return data as CardWithChallenges
}

/** C5 — the group's archived card history (newest first). */
export async function listArchivedCards(groupId: string): Promise<CardRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) throw new ActionError('error', error.message)
  return data ?? []
}

/** C8 — the group's unpublished drafts (owner/admin only, enforced by RLS). */
export async function listDraftCards(groupId: string): Promise<CardRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) throw new ActionError('error', error.message)
  return data ?? []
}
