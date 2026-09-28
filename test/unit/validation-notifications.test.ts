import { describe, it, expect } from 'vitest'
import { listNotificationsSchema, markReadSchema } from '@/lib/validation/notifications'

/**
 * Unit tests for the Notifications Zod schemas (N1 listNotifications / N2 markNotificationRead).
 * Contract (api-endpoints.md N1/N2, data-model.md): recipient lists their notifications paged
 * (unread-first), and marks one (by id) or all read. Tests assert against the schema SHAPES;
 * the endpoint agent owns the implementation.
 */

describe('listNotificationsSchema', () => {
  it('applies defaults when given an empty object', () => {
    const parsed = listNotificationsSchema.parse({})
    // limit has a positive default and unreadOnly defaults to false.
    expect(typeof parsed.limit).toBe('number')
    expect(parsed.limit).toBeGreaterThanOrEqual(1)
    expect(parsed.limit).toBeLessThanOrEqual(100)
    expect(parsed.unreadOnly).toBe(false)
  })

  it('accepts an explicit in-range limit and unreadOnly', () => {
    const parsed = listNotificationsSchema.parse({ limit: 25, unreadOnly: true })
    expect(parsed.limit).toBe(25)
    expect(parsed.unreadOnly).toBe(true)
  })

  it('accepts the lower boundary limit of 1', () => {
    expect(listNotificationsSchema.safeParse({ limit: 1 }).success).toBe(true)
  })

  it('accepts the upper boundary limit of 100', () => {
    expect(listNotificationsSchema.safeParse({ limit: 100 }).success).toBe(true)
  })

  it('rejects a limit below 1', () => {
    expect(listNotificationsSchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('rejects a limit above 100', () => {
    expect(listNotificationsSchema.safeParse({ limit: 101 }).success).toBe(false)
  })

  it('rejects a non-integer limit', () => {
    expect(listNotificationsSchema.safeParse({ limit: 10.5 }).success).toBe(false)
  })

  it('rejects a non-numeric limit', () => {
    expect(listNotificationsSchema.safeParse({ limit: '20' }).success).toBe(false)
  })

  it('rejects a non-boolean unreadOnly', () => {
    expect(listNotificationsSchema.safeParse({ unreadOnly: 'yes' }).success).toBe(false)
  })
})

describe('markReadSchema', () => {
  it('accepts an object with a valid uuid id (mark one)', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const parsed = markReadSchema.parse({ id })
    expect(parsed.id).toBe(id)
  })

  it('accepts an empty object (mark all — id optional)', () => {
    const parsed = markReadSchema.parse({})
    expect(parsed.id).toBeUndefined()
  })

  it('rejects a non-uuid id', () => {
    expect(markReadSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects a numeric id', () => {
    expect(markReadSchema.safeParse({ id: 12345 }).success).toBe(false)
  })
})
