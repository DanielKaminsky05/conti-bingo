import { describe, it, expect } from 'vitest'
import { createCardSchema } from '@/lib/validation/cards'

/**
 * Unit tests for the Cards create Zod schema (C1 createCard).
 * Contract (api-endpoints.md C1, decisions.md D6/D7):
 *   - gridSize ∈ {4, 5, 6}
 *   - freeSpace true only on odd grids (5×5) — forced false on 4×4 / 6×6 (D6)
 *   - challenges.length >= gridSize² − (freeSpace ? 1 : 0)
 *   - each challenge points > 0
 *   - endsAt > startsAt when both provided
 * Tests assert against the schema SHAPE; the endpoint agent owns the implementation.
 */

/** Build `n` valid challenges with positive points. */
function challenges(n: number): { text: string; points?: number }[] {
  return Array.from({ length: n }, (_, i) => ({ text: `challenge ${i + 1}`, points: 1 }))
}

/**
 * A valid createCard input. `gridSize` defaults to 5 with free space, so the
 * default challenge pool is 5² − 1 = 24. Override fields per-test.
 */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    groupId: '123e4567-e89b-42d3-a456-426614174000',
    title: 'Lecture Bingo',
    gridSize: 5,
    layoutMode: 'shuffled',
    freeSpace: true,
    winCondition: 'line',
    challenges: challenges(24),
    ...overrides,
  }
}

describe('createCardSchema — gridSize', () => {
  it('rejects gridSize 3', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 3, freeSpace: false, challenges: challenges(9) }),
    )
    expect(res.success).toBe(false)
  })

  it('rejects gridSize 7', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 7, freeSpace: false, challenges: challenges(49) }),
    )
    expect(res.success).toBe(false)
  })

  it('accepts gridSize 4 (freeSpace off, 16 challenges)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 4, freeSpace: false, challenges: challenges(16) }),
    )
    expect(res.success).toBe(true)
  })

  it('accepts gridSize 5 (freeSpace on, 24 challenges)', () => {
    const res = createCardSchema.safeParse(validInput())
    expect(res.success).toBe(true)
  })

  it('accepts gridSize 6 (freeSpace off, 36 challenges)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 6, freeSpace: false, challenges: challenges(36) }),
    )
    expect(res.success).toBe(true)
  })
})

describe('createCardSchema — freeSpace only on odd grids (D6)', () => {
  it('rejects freeSpace true on a 4×4 grid', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 4, freeSpace: true, challenges: challenges(16) }),
    )
    expect(res.success).toBe(false)
  })

  it('rejects freeSpace true on a 6×6 grid', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 6, freeSpace: true, challenges: challenges(36) }),
    )
    expect(res.success).toBe(false)
  })

  it('accepts freeSpace true on a 5×5 grid', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 5, freeSpace: true, challenges: challenges(24) }),
    )
    expect(res.success).toBe(true)
  })
})

describe('createCardSchema — challenge count fits the grid', () => {
  it('rejects too few challenges for a 5×5 with free space (23 < 24)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 5, freeSpace: true, challenges: challenges(23) }),
    )
    expect(res.success).toBe(false)
  })

  it('accepts exactly enough for a 5×5 with free space (24 == 5² − 1)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 5, freeSpace: true, challenges: challenges(24) }),
    )
    expect(res.success).toBe(true)
  })

  it('rejects too few challenges for a 4×4 (15 < 16)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 4, freeSpace: false, challenges: challenges(15) }),
    )
    expect(res.success).toBe(false)
  })

  it('accepts exactly enough for a 4×4 (16 == 4²)', () => {
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 4, freeSpace: false, challenges: challenges(16) }),
    )
    expect(res.success).toBe(true)
  })
})

describe('createCardSchema — points must be positive', () => {
  it('rejects a challenge with points = 0', () => {
    const bad = challenges(24)
    bad[0] = { text: 'zero points', points: 0 }
    const res = createCardSchema.safeParse(validInput({ challenges: bad }))
    expect(res.success).toBe(false)
  })

  it('rejects a challenge with negative points', () => {
    const bad = challenges(24)
    bad[5] = { text: 'negative points', points: -3 }
    const res = createCardSchema.safeParse(validInput({ challenges: bad }))
    expect(res.success).toBe(false)
  })
})

describe('createCardSchema — schedule (endsAt > startsAt)', () => {
  it('rejects endsAt equal to startsAt', () => {
    const when = '2026-10-01T12:00:00.000Z'
    const res = createCardSchema.safeParse(validInput({ startsAt: when, endsAt: when }))
    expect(res.success).toBe(false)
  })

  it('rejects endsAt before startsAt', () => {
    const res = createCardSchema.safeParse(
      validInput({
        startsAt: '2026-10-02T12:00:00.000Z',
        endsAt: '2026-10-01T12:00:00.000Z',
      }),
    )
    expect(res.success).toBe(false)
  })

  it('accepts endsAt after startsAt', () => {
    const res = createCardSchema.safeParse(
      validInput({
        startsAt: '2026-10-01T12:00:00.000Z',
        endsAt: '2026-10-02T12:00:00.000Z',
      }),
    )
    expect(res.success).toBe(true)
  })

  it('accepts a card with neither startsAt nor endsAt', () => {
    const res = createCardSchema.safeParse(validInput())
    expect(res.success).toBe(true)
  })
})
