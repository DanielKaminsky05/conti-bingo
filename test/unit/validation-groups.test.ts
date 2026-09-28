import { describe, it, expect } from 'vitest'
import {
  createGroupSchema,
  updateGroupSchema,
  updateMemberRoleSchema,
} from '@/lib/validation/groups'

const UUID = '00000000-0000-4000-8000-000000000000'

describe('createGroupSchema', () => {
  it('accepts a valid name with no description', () => {
    const parsed = createGroupSchema.parse({ name: 'Section 5' })
    expect(parsed.name).toBe('Section 5')
    expect(parsed.description).toBeUndefined()
  })

  it('accepts a valid name with a description', () => {
    const parsed = createGroupSchema.parse({ name: 'Section 5', description: 'Our bingo group' })
    expect(parsed.description).toBe('Our bingo group')
  })

  it('trims surrounding whitespace on the name', () => {
    const parsed = createGroupSchema.parse({ name: '  Trimmed  ' })
    expect(parsed.name).toBe('Trimmed')
  })

  it('rejects an empty name', () => {
    expect(createGroupSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects a whitespace-only name (after trim)', () => {
    expect(createGroupSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(createGroupSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('accepts a name of exactly 80 characters', () => {
    expect(createGroupSchema.safeParse({ name: 'a'.repeat(80) }).success).toBe(true)
  })

  it('rejects a missing name', () => {
    expect(createGroupSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a non-string name', () => {
    expect(createGroupSchema.safeParse({ name: 123 }).success).toBe(false)
  })

  it('rejects a description longer than 500 characters', () => {
    expect(
      createGroupSchema.safeParse({ name: 'ok', description: 'x'.repeat(501) }).success
    ).toBe(false)
  })
})

describe('updateGroupSchema', () => {
  it('accepts a partial update of just the name', () => {
    const parsed = updateGroupSchema.parse({ groupId: UUID, name: 'Renamed' })
    expect(parsed.name).toBe('Renamed')
    expect(parsed.groupId).toBe(UUID)
  })

  it('accepts toggling join_locked', () => {
    const parsed = updateGroupSchema.parse({ groupId: UUID, joinLocked: true })
    expect(parsed.joinLocked).toBe(true)
  })

  it('accepts a null description (clearing it)', () => {
    const parsed = updateGroupSchema.parse({ groupId: UUID, description: null })
    expect(parsed.description).toBeNull()
  })

  it('requires a valid uuid groupId', () => {
    expect(updateGroupSchema.safeParse({ groupId: 'not-a-uuid', name: 'x' }).success).toBe(false)
  })

  it('rejects a missing groupId', () => {
    expect(updateGroupSchema.safeParse({ name: 'x' }).success).toBe(false)
  })

  it('rejects an empty name when provided', () => {
    expect(updateGroupSchema.safeParse({ groupId: UUID, name: '' }).success).toBe(false)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(
      updateGroupSchema.safeParse({ groupId: UUID, name: 'a'.repeat(81) }).success
    ).toBe(false)
  })

  it('rejects a non-boolean joinLocked', () => {
    expect(
      updateGroupSchema.safeParse({ groupId: UUID, joinLocked: 'yes' }).success
    ).toBe(false)
  })
})

describe('updateMemberRoleSchema', () => {
  it('accepts role "admin"', () => {
    const parsed = updateMemberRoleSchema.parse({ groupId: UUID, userId: UUID, role: 'admin' })
    expect(parsed.role).toBe('admin')
  })

  it('accepts role "member"', () => {
    const parsed = updateMemberRoleSchema.parse({ groupId: UUID, userId: UUID, role: 'member' })
    expect(parsed.role).toBe('member')
  })

  it('rejects role "owner" (ownership moves via transfer, not this endpoint)', () => {
    expect(
      updateMemberRoleSchema.safeParse({ groupId: UUID, userId: UUID, role: 'owner' }).success
    ).toBe(false)
  })

  it('rejects an unknown role', () => {
    expect(
      updateMemberRoleSchema.safeParse({ groupId: UUID, userId: UUID, role: 'superuser' }).success
    ).toBe(false)
  })

  it('requires a valid uuid userId', () => {
    expect(
      updateMemberRoleSchema.safeParse({ groupId: UUID, userId: 'nope', role: 'member' }).success
    ).toBe(false)
  })

  it('requires a valid uuid groupId', () => {
    expect(
      updateMemberRoleSchema.safeParse({ groupId: 'nope', userId: UUID, role: 'member' }).success
    ).toBe(false)
  })

  it('rejects a missing role', () => {
    expect(updateMemberRoleSchema.safeParse({ groupId: UUID, userId: UUID }).success).toBe(false)
  })
})
