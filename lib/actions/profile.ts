'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/session'
import { withResult, ActionError, type ActionResult } from '@/lib/actions/result'
import { updateProfileSchema } from '@/lib/validation/profile'
import type { Tables } from '@/lib/supabase/database.types'

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * U2 — Update the caller's own `username` (unique, case-insensitive at the DB
 * level) and display `name`. A unique-violation surfaces as a clean conflict.
 */
export async function updateProfile(
  input: unknown
): Promise<ActionResult<Tables<'profiles'>>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const parsed = updateProfileSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { username, name } = parsed.data

    const { data, error } = await supabase
      .from('profiles')
      .update({ username, name })
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new ActionError('conflict', 'That username is taken.')
      }
      throw new ActionError('error', error.message)
    }

    revalidatePath('/profile')
    return data
  })
}

/**
 * U3 — Upload/replace the caller's avatar under `avatars/{userId}/…` and store
 * the resulting path on their profile. Validates content-type and size.
 */
export async function uploadAvatar(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const file = formData.get('file')
    if (!(file instanceof File)) {
      throw new ActionError('validation', 'No file was provided.')
    }
    if (!file.type.startsWith('image/')) {
      throw new ActionError('validation', 'Avatar must be an image.')
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new ActionError('validation', 'Avatar must be 5 MB or smaller.')
    }

    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true })

    if (uploadError) {
      throw new ActionError('error', uploadError.message)
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_path: path })
      .eq('id', user.id)

    if (updateError) {
      throw new ActionError('error', updateError.message)
    }

    revalidatePath('/profile')
    return { path }
  })
}

/** U4 — Clear the caller's avatar back to the default. */
export async function removeAvatar(): Promise<ActionResult<null>> {
  return withResult(async () => {
    const { supabase, user } = await requireUser()

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('id', user.id)

    if (error) {
      throw new ActionError('error', error.message)
    }

    revalidatePath('/profile')
    return null
  })
}
