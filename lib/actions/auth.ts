'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ok, fail, withResult, ActionError, type ActionResult } from '@/lib/actions/result'
import { requireUser } from '@/lib/auth/session'
import {
  signUpSchema,
  signInSchema,
  resendSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changeEmailSchema,
} from '@/lib/validation/auth'

/**
 * Derive the site origin for building `emailRedirectTo`. Prefers the request
 * headers (`origin`, then a reconstructed `x-forwarded-*` host) and falls back
 * to `NEXT_PUBLIC_SITE_URL` when neither is present.
 */
async function resolveOrigin(): Promise<string> {
  const h = await headers()
  const origin = h.get('origin')
  if (origin) return origin

  const forwardedHost = h.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = h.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${forwardedHost}`
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) return siteUrl

  throw new ActionError('error', 'Unable to determine the site origin.')
}

/**
 * A1 — Register a new account (email + name + password). Supabase sends a
 * confirmation email; the account stays unconfirmed until the link is followed
 * (D3). Returns the new user's id.
 */
export async function signUp(input: unknown): Promise<ActionResult<{ userId: string }>> {
  return withResult(async () => {
    const parsed = signUpSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { email, name, password } = parsed.data

    const origin = await resolveOrigin()
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      throw new ActionError('error', error.message)
    }
    if (!data.user) {
      throw new ActionError('error', 'Sign-up did not return a user.')
    }

    return { userId: data.user.id }
  })
}

/**
 * A2 — Password sign-in. Requires a confirmed email; an unconfirmed account
 * cannot establish a session.
 */
export async function signIn(input: unknown): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }
  const { email, password } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const code = error.code ?? ''
    if (code === 'email_not_confirmed' || /confirm/i.test(error.message)) {
      return fail('forbidden', 'Please confirm your email first.')
    }
    return fail('unauthorized', 'Invalid email or password.')
  }

  return ok(null)
}

/** A3 — End the current session. */
export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    return fail('error', error.message)
  }
  return ok(null)
}

/**
 * A4 — Re-send the confirmation email for an unconfirmed address. Supabase does
 * not leak whether the address exists / is already confirmed.
 */
export async function resendConfirmation(input: unknown): Promise<ActionResult<null>> {
  const parsed = resendSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }
  const { email } = parsed.data

  const origin = await resolveOrigin()
  const supabase = await createClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    return fail('error', error.message)
  }
  return ok(null)
}

/**
 * A5 — Request a password-reset email. Public (no session). Supabase sends a
 * recovery link that lands on `/auth/callback?next=/reset-password`, which
 * exchanges the code for a session and forwards to the reset page. Does NOT leak
 * whether the address exists — always returns success (mirrors resendConfirmation).
 */
export async function requestPasswordReset(input: unknown): Promise<ActionResult<null>> {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return fail('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
  }
  const { email } = parsed.data

  const origin = await resolveOrigin()
  const supabase = await createClient()

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  // Always report success so we don't reveal whether the email is registered.
  return ok(null)
}

/**
 * A6 — Set a new password for the signed-in user. Requires an authenticated
 * session (the recovery session established by the email link). Validates that
 * the two password fields match before calling Supabase.
 */
export async function updatePassword(input: unknown): Promise<ActionResult<null>> {
  return withResult(async () => {
    const parsed = resetPasswordSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { password } = parsed.data

    const { supabase } = await requireUser()

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      throw new ActionError('error', error.message)
    }

    return null
  })
}

/**
 * Change the signed-in user's email. Supabase sends a confirmation link to the
 * new address (and, per project settings, the old one); the change only takes
 * effect once confirmed, so the current email keeps working until then.
 */
export async function updateEmail(input: unknown): Promise<ActionResult<null>> {
  return withResult(async () => {
    const parsed = changeEmailSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('validation', parsed.error.issues[0]?.message ?? 'Invalid input.')
    }
    const { email } = parsed.data

    const origin = await resolveOrigin()
    const { supabase } = await requireUser()

    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${origin}/auth/callback` }
    )
    if (error) {
      throw new ActionError('error', error.message)
    }

    return null
  })
}
