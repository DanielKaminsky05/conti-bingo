import { z } from 'zod'

export const signUpSchema = z.object({
  email: z.email('Enter a valid email address.'),
  name: z.string().trim().min(1, 'Name is required.').max(80, 'Name is too long.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

export const resendSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

export const resetPasswordSchema = z
  .object({
    // Same password rule as signUpSchema.
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

export const changeEmailSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

/**
 * Same-origin redirect target: a path starting with a single "/". Anything
 * else (absolute URLs, protocol-relative "//evil.com", "/\evil.com") falls
 * back to "/" so a crafted email link can't send users off-site.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}

/** Email-link types Supabase can issue for `verifyOtp({ token_hash, type })`. */
export const EMAIL_LINK_TYPES = ['signup', 'email', 'recovery', 'email_change', 'invite', 'magiclink'] as const

export const confirmTokenSchema = z.object({
  tokenHash: z.string().trim().min(1, 'This link is missing its token.').max(512, 'This link is invalid.'),
  type: z.enum(EMAIL_LINK_TYPES, 'This link is invalid.'),
  next: z.string().max(512).optional().transform(safeNextPath),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type SignInInput = z.infer<typeof signInSchema>
export type ResendInput = z.infer<typeof resendSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ConfirmTokenInput = z.input<typeof confirmTokenSchema>
