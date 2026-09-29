import { describe, it, expect } from 'vitest'
import { markCoopCellSchema, coopCardIdSchema } from '@/lib/validation/coop'

const uuid = '123e4567-e89b-42d3-a456-426614174000'

describe('markCoopCellSchema', () => {
  it('accepts a valid mark', () => {
    const res = markCoopCellSchema.safeParse({ cardId: uuid, position: 0, marked: true })
    expect(res.success).toBe(true)
  })

  it('accepts a valid unmark', () => {
    const res = markCoopCellSchema.safeParse({ cardId: uuid, position: 12, marked: false })
    expect(res.success).toBe(true)
  })

  it('rejects a negative position', () => {
    const res = markCoopCellSchema.safeParse({ cardId: uuid, position: -1, marked: true })
    expect(res.success).toBe(false)
  })

  it('rejects a non-integer position', () => {
    const res = markCoopCellSchema.safeParse({ cardId: uuid, position: 1.5, marked: true })
    expect(res.success).toBe(false)
  })

  it('rejects a bad card id', () => {
    const res = markCoopCellSchema.safeParse({ cardId: 'nope', position: 0, marked: true })
    expect(res.success).toBe(false)
  })
})

describe('coopCardIdSchema', () => {
  it('accepts a uuid', () => {
    expect(coopCardIdSchema.safeParse({ cardId: uuid }).success).toBe(true)
  })
  it('rejects a non-uuid', () => {
    expect(coopCardIdSchema.safeParse({ cardId: '1' }).success).toBe(false)
  })
})
