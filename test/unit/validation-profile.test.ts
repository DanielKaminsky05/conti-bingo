import { describe, it, expect } from 'vitest'
import { updateProfileSchema } from '@/lib/validation/profile'

/**
 * Unit tests for the Profile update Zod schema (U2 updateProfile).
 * Contract (api-endpoints.md U2, D7): username 3-20 chars of [a-z0-9_] (lowercase only;
 * uniqueness enforced case-insensitively at the DB layer, not here); name 1-80 chars.
 * Tests assert against the schema SHAPE; the endpoint agent owns the implementation.
 */

const validName = 'Grace Hopper'

describe('updateProfileSchema', () => {
  it('parses a valid { username, name }', () => {
    const parsed = updateProfileSchema.parse({ username: 'daniel_23', name: validName })
    expect(parsed.username).toBe('daniel_23')
    expect(parsed.name).toBe(validName)
  })

  it('accepts lowercase letters, digits, and underscores', () => {
    expect(updateProfileSchema.safeParse({ username: 'a_b_2_c', name: validName }).success).toBe(true)
    expect(updateProfileSchema.safeParse({ username: 'user_123', name: validName }).success).toBe(true)
    expect(updateProfileSchema.safeParse({ username: '___', name: validName }).success).toBe(true)
  })

  it('accepts a username of exactly 3 characters (lower boundary)', () => {
    expect(updateProfileSchema.safeParse({ username: 'abc', name: validName }).success).toBe(true)
  })

  it('accepts a username of exactly 20 characters (upper boundary)', () => {
    expect(updateProfileSchema.safeParse({ username: 'a'.repeat(20), name: validName }).success).toBe(true)
  })

  it('rejects a username shorter than 3 characters', () => {
    expect(updateProfileSchema.safeParse({ username: 'ab', name: validName }).success).toBe(false)
  })

  it('rejects a username longer than 20 characters', () => {
    expect(updateProfileSchema.safeParse({ username: 'a'.repeat(21), name: validName }).success).toBe(false)
  })

  it('rejects uppercase letters', () => {
    expect(updateProfileSchema.safeParse({ username: 'Daniel', name: validName }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ username: 'ABC', name: validName }).success).toBe(false)
  })

  it('rejects disallowed characters (hyphen, dot, space, at-sign)', () => {
    expect(updateProfileSchema.safeParse({ username: 'da-niel', name: validName }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ username: 'da.niel', name: validName }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ username: 'da niel', name: validName }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ username: 'da@niel', name: validName }).success).toBe(false)
  })

  it('rejects an empty username', () => {
    expect(updateProfileSchema.safeParse({ username: '', name: validName }).success).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(updateProfileSchema.safeParse({ username: 'daniel', name: '' }).success).toBe(false)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(
      updateProfileSchema.safeParse({ username: 'daniel', name: 'a'.repeat(81) }).success,
    ).toBe(false)
  })

  it('accepts a name of exactly 80 characters (boundary)', () => {
    expect(
      updateProfileSchema.safeParse({ username: 'daniel', name: 'a'.repeat(80) }).success,
    ).toBe(true)
  })
})
