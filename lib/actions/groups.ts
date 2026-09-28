'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { ActionError, ok, fail, withResult, type ActionResult } from '@/lib/actions/result'
import { generateJoinCode } from '@/lib/bingo/joinCode'
import {
  createGroupSchema,
  updateGroupSchema,
  groupIdSchema,
  archiveGroupSchema,
  updateMemberRoleSchema,
  removeMemberSchema,
  type CreateGroupInput,
  type UpdateGroupInput,
  type ArchiveGroupInput,
  type UpdateMemberRoleInput,
  type RemoveMemberInput,
} from '@/lib/validation/groups'
import type { Tables } from '@/lib/supabase/database.types'

type Group = Tables<'groups'>

const IMAGE_BUCKET = 'group-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** G1 — create a group via the membership RPC; creator becomes the owner member. */
export async function createGroup(input: CreateGroupInput): Promise<ActionResult<Group>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = createGroupSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { data, error } = await supabase.rpc('create_group', {
      p_name: parsed.data.name,
      p_description: parsed.data.description,
    })
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('error', 'Failed to create group.')

    revalidatePath('/groups')
    return data as Group
  })
}

/** G4 — edit name/description/join_locked (RLS: owner/admin). */
export async function updateGroup(input: UpdateGroupInput): Promise<ActionResult<Group>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = updateGroupSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { groupId, name, description, joinLocked } = parsed.data
    const patch: Partial<Group> = {}
    if (name !== undefined) patch.name = name
    if (description !== undefined) patch.description = description
    if (joinLocked !== undefined) patch.join_locked = joinLocked

    if (Object.keys(patch).length === 0) {
      throw new ActionError('validation', 'Nothing to update.')
    }

    const { data, error } = await supabase
      .from('groups')
      .update(patch)
      .eq('id', groupId)
      .select()
      .single()
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('not_found', 'Group not found or not permitted.')

    revalidatePath(`/groups/${groupId}`)
    revalidatePath('/groups')
    return data
  })
}

/** G5 — delete the group (RLS: owner only). Cascades. */
export async function deleteGroup(input: { groupId: string }): Promise<ActionResult<{ groupId: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = groupIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { error } = await supabase.from('groups').delete().eq('id', parsed.data.groupId)
    if (error) throw new ActionError('error', error.message)

    revalidatePath('/groups')
    return { groupId: parsed.data.groupId }
  })
}

/** G12 — archive/reactivate the group (RLS: owner only). */
export async function archiveGroup(input: ArchiveGroupInput): Promise<ActionResult<Group>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = archiveGroupSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { groupId, archived } = parsed.data
    const { data, error } = await supabase
      .from('groups')
      .update({ status: archived ? 'archived' : 'active' })
      .eq('id', groupId)
      .select()
      .single()
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('not_found', 'Group not found or not permitted.')

    revalidatePath(`/groups/${groupId}`)
    revalidatePath('/groups')
    return data
  })
}

/** G6 — join a group via its join code (RPC; blocked when join_locked). */
export async function joinGroup(input: { joinCode: string }): Promise<ActionResult<Group>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const code = typeof input?.joinCode === 'string' ? input.joinCode.trim() : ''
    if (!code) {
      throw new ActionError('validation', 'A join code is required.')
    }

    const { data, error } = await supabase.rpc('join_group', { p_code: code })
    if (error) throw new ActionError('error', error.message)
    if (!data) throw new ActionError('not_found', 'Invalid join code.')

    const group = data as Group
    revalidatePath('/groups')
    revalidatePath(`/groups/${group.id}`)
    return group
  })
}

/** G7 — leave a group. The owner is blocked by RLS (must transfer first). */
export async function leaveGroup(input: { groupId: string }): Promise<ActionResult<{ groupId: string }>> {
  let ctx
  try {
    ctx = await requireUser()
  } catch (e) {
    if (e instanceof ActionError) return fail(e.code, e.message)
    throw e
  }
  const { supabase, user } = ctx
  const parsed = groupIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }

  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', user.id)
    .select('id')

  if (error) return fail('error', error.message)
  if (!data || data.length === 0) {
    // RLS blocks the owner from deleting their own membership; surface it cleanly.
    return fail('forbidden', 'The owner must transfer ownership before leaving.')
  }

  revalidatePath('/groups')
  revalidatePath(`/groups/${parsed.data.groupId}`)
  return ok({ groupId: parsed.data.groupId })
}

/** G9 — remove another member (RLS enforces owner/admin rules). */
export async function removeMember(input: RemoveMemberInput): Promise<ActionResult<{ groupId: string; userId: string }>> {
  let ctx
  try {
    ctx = await requireUser()
  } catch (e) {
    if (e instanceof ActionError) return fail(e.code, e.message)
    throw e
  }
  const { supabase } = ctx
  const parsed = removeMemberSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }

  const { groupId, userId } = parsed.data
  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('id')

  if (error) return fail('error', error.message)
  if (!data || data.length === 0) {
    return fail('forbidden', 'Member not found or not permitted.')
  }

  revalidatePath(`/groups/${groupId}`)
  return ok({ groupId, userId })
}

/** G10 — rotate the join code (RLS: owner/admin). Retries on unique conflict. */
export async function regenerateJoinCode(input: { groupId: string }): Promise<ActionResult<{ joinCode: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()
    const parsed = groupIdSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }

    const { groupId } = parsed.data
    const MAX_ATTEMPTS = 5
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const joinCode = generateJoinCode()
      const { data, error } = await supabase
        .from('groups')
        .update({ join_code: joinCode })
        .eq('id', groupId)
        .select('join_code')
        .single()

      if (!error && data) {
        revalidatePath(`/groups/${groupId}`)
        return { joinCode: data.join_code }
      }
      // 23505 = unique_violation → retry with a fresh code.
      if (error && error.code === '23505') continue
      if (error) throw new ActionError('error', error.message)
      throw new ActionError('not_found', 'Group not found or not permitted.')
    }
    throw new ActionError('conflict', 'Could not generate a unique join code. Please try again.')
  })
}

/** G11 — set a member's role (RLS: owner only; cannot set 'owner'). */
export async function updateMemberRole(input: UpdateMemberRoleInput): Promise<ActionResult<{ groupId: string; userId: string; role: 'admin' | 'member' }>> {
  let ctx
  try {
    ctx = await requireUser()
  } catch (e) {
    if (e instanceof ActionError) return fail(e.code, e.message)
    throw e
  }
  const { supabase } = ctx
  const parsed = updateMemberRoleSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }

  const { groupId, userId, role } = parsed.data
  const { data, error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('id')

  if (error) return fail('error', error.message)
  if (!data || data.length === 0) {
    return fail('forbidden', 'Member not found or not permitted.')
  }

  revalidatePath(`/groups/${groupId}`)
  return ok({ groupId, userId, role })
}

/** G13 — upload/replace the group image (RLS: owner/admin) and store its path. */
export async function uploadGroupImage(formData: FormData): Promise<ActionResult<{ imagePath: string }>> {
  return withResult(async () => {
    const { supabase } = await requireUser()

    const groupId = formData.get('groupId')
    const file = formData.get('file')

    if (typeof groupId !== 'string' || !groupIdSchema.safeParse({ groupId }).success) {
      throw new ActionError('validation', 'A valid groupId is required.')
    }
    if (!(file instanceof File)) {
      throw new ActionError('validation', 'A file is required.')
    }
    if (!file.type.startsWith('image/')) {
      throw new ActionError('validation', 'File must be an image.')
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ActionError('validation', 'Image must be 5 MB or smaller.')
    }

    const path = `${groupId}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw new ActionError('error', uploadError.message)

    const { data, error } = await supabase
      .from('groups')
      .update({ image_path: path })
      .eq('id', groupId)
      .select('image_path')
      .single()
    if (error) throw new ActionError('error', error.message)
    if (!data?.image_path) throw new ActionError('not_found', 'Group not found or not permitted.')

    revalidatePath(`/groups/${groupId}`)
    return { imagePath: data.image_path }
  })
}
