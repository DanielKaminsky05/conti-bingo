import { describe, it, expect } from 'vitest'
import {
  signUpSchema,
  signInSchema,
  resendSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/lib/validation/auth'

/**
 * Unit tests for the Auth Zod schemas (A1 signUp / A2 signIn / A4 resendConfirmation
 * / A5 forgotPassword / A6 resetPassword). Contract (api-endpoints.md): valid email,
 * name 1-80 chars, password min length (>= 8), reset requires matching confirm.
 */

const validEmail = 'player@example.test'
const validPassword = 'Sup3rSecret!'
const validName = 'Ada Lovelace'

describe('signUpSchema', () => {
  it('parses a valid { email, name, password }', () => {
    const parsed = signUpSchema.parse({
      email: validEmail,
      name: validName,
      password: validPassword,
    })
    expect(parsed.email).toBe(validEmail)
    expect(parsed.name).toBe(validName)
    expect(parsed.password).toBe(validPassword)
  })

  it('rejects a malformed email', () => {
    const res = signUpSchema.safeParse({
      email: 'not-an-email',
      name: validName,
      password: validPassword,
    })
    expect(res.success).toBe(false)
  })

  it('rejects a password shorter than 8 characters', () => {
    const res = signUpSchema.safeParse({
      email: validEmail,
      name: validName,
      password: 'short7!', // 7 chars
    })
    expect(res.success).toBe(false)
  })

  it('accepts a password of exactly 8 characters (boundary)', () => {
    const res = signUpSchema.safeParse({
      email: validEmail,
      name: validName,
      password: 'eightch8',
    })
    expect(res.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const res = signUpSchema.safeParse({
      email: validEmail,
      name: '',
      password: validPassword,
    })
    expect(res.success).toBe(false)
  })

  it('rejects a name longer than 80 characters', () => {
    const res = signUpSchema.safeParse({
      email: validEmail,
      name: 'a'.repeat(81),
      password: validPassword,
    })
    expect(res.success).toBe(false)
  })

  it('accepts a name of exactly 80 characters (boundary)', () => {
    const res = signUpSchema.safeParse({
      email: validEmail,
      name: 'a'.repeat(80),
      password: validPassword,
    })
    expect(res.success).toBe(true)
  })

  it('rejects a missing password field', () => {
    const res = signUpSchema.safeParse({ email: validEmail, name: validName })
    expect(res.success).toBe(false)
  })
})

describe('signInSchema', () => {
  it('parses a valid { email, password }', () => {
    const parsed = signInSchema.parse({ email: validEmail, password: validPassword })
    expect(parsed.email).toBe(validEmail)
    expect(parsed.password).toBe(validPassword)
  })

  it('rejects a malformed email', () => {
    const res = signInSchema.safeParse({ email: 'nope', password: validPassword })
    expect(res.success).toBe(false)
  })

  it('rejects a missing password', () => {
    const res = signInSchema.safeParse({ email: validEmail })
    expect(res.success).toBe(false)
  })
})

describe('resendSchema', () => {
  it('parses a valid { email }', () => {
    const parsed = resendSchema.parse({ email: validEmail })
    expect(parsed.email).toBe(validEmail)
  })

  it('rejects a malformed email', () => {
    const res = resendSchema.safeParse({ email: 'still-not-an-email' })
    expect(res.success).toBe(false)
  })

  it('rejects a missing email', () => {
    const res = resendSchema.safeParse({})
    expect(res.success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('parses a valid { email }', () => {
    const parsed = forgotPasswordSchema.parse({ email: validEmail })
    expect(parsed.email).toBe(validEmail)
  })

  it('rejects a malformed email', () => {
    const res = forgotPasswordSchema.safeParse({ email: 'nope' })
    expect(res.success).toBe(false)
  })

  it('rejects a missing email', () => {
    const res = forgotPasswordSchema.safeParse({})
    expect(res.success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('parses a valid { password, confirm } that match', () => {
    const parsed = resetPasswordSchema.parse({
      password: validPassword,
      confirm: validPassword,
    })
    expect(parsed.password).toBe(validPassword)
    expect(parsed.confirm).toBe(validPassword)
  })

  it('accepts a password of exactly 8 characters (boundary)', () => {
    const res = resetPasswordSchema.safeParse({
      password: 'eightch8',
      confirm: 'eightch8',
    })
    expect(res.success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const res = resetPasswordSchema.safeParse({
      password: 'short7!', // 7 chars
      confirm: 'short7!',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'password')).toBe(true)
    }
  })

  it('rejects when password and confirm do not match (error on confirm)', () => {
    const res = resetPasswordSchema.safeParse({
      password: validPassword,
      confirm: 'Different1!',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      const mismatch = res.error.issues.find((i) => i.path[0] === 'confirm')
      expect(mismatch).toBeDefined()
      expect(mismatch?.message).toBe('Passwords do not match.')
    }
  })

  it('rejects a missing confirm field', () => {
    const res = resetPasswordSchema.safeParse({ password: validPassword })
    expect(res.success).toBe(false)
  })
})
