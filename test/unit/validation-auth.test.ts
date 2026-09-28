import { describe, it, expect } from 'vitest'
import { signUpSchema, signInSchema, resendSchema } from '@/lib/validation/auth'

/**
 * Unit tests for the Auth Zod schemas (A1 signUp / A2 signIn / A4 resendConfirmation).
 * Contract (api-endpoints.md A1/A2/A4): valid email, name 1-80 chars, password min length
 * (>= 8). Tests assert against the schema SHAPES; the endpoint agent owns the implementation.
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
