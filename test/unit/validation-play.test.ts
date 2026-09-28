import { describe, it, expect } from 'vitest'
import { markCellSchema } from '@/lib/validation/play'

/**
 * Unit tests for the Play Zod schema (P3 markCell).
 * Contract (api-endpoints.md P3): { playerCardId (uuid), position (int ≥ 0), marked (bool) }.
 */

const validUuid = '11111111-1111-4111-8111-111111111111'

describe('markCellSchema', () => {
  it('parses a valid { playerCardId, position, marked }', () => {
    const parsed = markCellSchema.parse({
      playerCardId: validUuid,
      position: 12,
      marked: true,
    })
    expect(parsed.playerCardId).toBe(validUuid)
    expect(parsed.position).toBe(12)
    expect(parsed.marked).toBe(true)
  })

  it('accepts position 0 (boundary) and marked=false', () => {
    const res = markCellSchema.safeParse({ playerCardId: validUuid, position: 0, marked: false })
    expect(res.success).toBe(true)
  })

  it('rejects a negative position', () => {
    const res = markCellSchema.safeParse({ playerCardId: validUuid, position: -1, marked: true })
    expect(res.success).toBe(false)
  })

  it('rejects a non-integer position', () => {
    const res = markCellSchema.safeParse({ playerCardId: validUuid, position: 3.5, marked: true })
    expect(res.success).toBe(false)
  })

  it('rejects a non-uuid playerCardId', () => {
    const res = markCellSchema.safeParse({ playerCardId: 'not-a-uuid', position: 1, marked: true })
    expect(res.success).toBe(false)
  })

  it('rejects a missing marked field', () => {
    const res = markCellSchema.safeParse({ playerCardId: validUuid, position: 1 })
    expect(res.success).toBe(false)
  })

  it('rejects a non-boolean marked', () => {
    const res = markCellSchema.safeParse({ playerCardId: validUuid, position: 1, marked: 'yes' })
    expect(res.success).toBe(false)
  })

  it('rejects a missing playerCardId', () => {
    const res = markCellSchema.safeParse({ position: 1, marked: true })
    expect(res.success).toBe(false)
  })
})
