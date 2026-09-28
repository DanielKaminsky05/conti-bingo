import { describe, it, expect } from 'vitest'
import { createInviteSchema, tokenSchema } from '@/lib/validation/invites'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('createInviteSchema', () => {
  it('accepts a minimal invite and defaults role to "member"', () => {
    const parsed = createInviteSchema.parse({ groupId: UUID })
    expect(parsed.role).toBe('member')
    expect(parsed.email).toBeUndefined()
    expect(parsed.expiresInHours).toBeUndefined()
  })

  it('accepts an explicit role of "admin"', () => {
    const parsed = createInviteSchema.parse({ groupId: UUID, role: 'admin' })
    expect(parsed.role).toBe('admin')
  })

  it('accepts a valid optional email', () => {
    const parsed = createInviteSchema.parse({ groupId: UUID, email: 'invitee@example.com' })
    expect(parsed.email).toBe('invitee@example.com')
  })

  it('accepts a positive integer expiresInHours', () => {
    const parsed = createInviteSchema.parse({ groupId: UUID, expiresInHours: 72 })
    expect(parsed.expiresInHours).toBe(72)
  })

  it('rejects role "owner"', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, role: 'owner' }).success).toBe(false)
  })

  it('rejects an unknown role', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, role: 'guest' }).success).toBe(false)
  })

  it('rejects an invalid email when provided', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, email: 'not-an-email' }).success).toBe(
      false
    )
  })

  it('requires a valid uuid groupId', () => {
    expect(createInviteSchema.safeParse({ groupId: 'nope' }).success).toBe(false)
  })

  it('rejects a missing groupId', () => {
    expect(createInviteSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a zero expiresInHours', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, expiresInHours: 0 }).success).toBe(false)
  })

  it('rejects a negative expiresInHours', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, expiresInHours: -5 }).success).toBe(false)
  })

  it('rejects a fractional expiresInHours', () => {
    expect(createInviteSchema.safeParse({ groupId: UUID, expiresInHours: 1.5 }).success).toBe(false)
  })
})

describe('tokenSchema', () => {
  it('accepts a non-empty token', () => {
    const parsed = tokenSchema.parse({ token: 'abc123' })
    expect(parsed.token).toBe('abc123')
  })

  it('rejects an empty token', () => {
    expect(tokenSchema.safeParse({ token: '' }).success).toBe(false)
  })

  it('rejects a missing token', () => {
    expect(tokenSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a non-string token', () => {
    expect(tokenSchema.safeParse({ token: 42 }).success).toBe(false)
  })
})
