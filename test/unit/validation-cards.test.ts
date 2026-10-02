import { describe, it, expect } from 'vitest'
import { createCardSchema, challengeInputSchema } from '@/lib/validation/cards'

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

describe('challengeInputSchema — text/image are each optional but one is required', () => {
  it('accepts a text-only square', () => {
    const res = challengeInputSchema.safeParse({ text: 'Thank the prof', points: 1 })
    expect(res.success).toBe(true)
  })

  it('accepts an image-only square (no text)', () => {
    const res = challengeInputSchema.safeParse({
      imagePath: 'group-1/challenges/abc-photo.png',
      points: 2,
    })
    expect(res.success).toBe(true)
  })

  it('accepts a text + image square', () => {
    const res = challengeInputSchema.safeParse({
      text: 'Spot the mascot',
      imagePath: 'group-1/challenges/abc-photo.png',
      points: 1,
    })
    expect(res.success).toBe(true)
  })

  it('rejects a square with neither text nor image', () => {
    const res = challengeInputSchema.safeParse({ points: 1 })
    expect(res.success).toBe(false)
  })

  it('rejects a square with empty text and no image', () => {
    const res = challengeInputSchema.safeParse({ text: '   ', points: 1 })
    expect(res.success).toBe(false)
  })

  it('defaults points to 1', () => {
    const res = challengeInputSchema.safeParse({ text: 'hi' })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.points).toBe(1)
  })
})

describe('createCardSchema — image-only squares count toward the grid', () => {
  it('accepts a 4×4 filled entirely with image-only squares', () => {
    const imageSquares = Array.from({ length: 16 }, (_, i) => ({
      imagePath: `group-1/challenges/${i}.png`,
      points: 1,
    }))
    const res = createCardSchema.safeParse(
      validInput({ gridSize: 4, freeSpace: false, challenges: imageSquares }),
    )
    expect(res.success).toBe(true)
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

describe('createCardSchema — freeSpaceImagePath', () => {
  // The editor sends `null` to clear the image whenever there's no free space.
  it('accepts null (no free space)', () => {
    const res = createCardSchema.safeParse(
      validInput({ freeSpace: false, freeSpaceImagePath: null, challenges: challenges(25) }),
    )
    expect(res.success).toBe(true)
  })

  it('accepts a storage path', () => {
    const res = createCardSchema.safeParse(validInput({ freeSpaceImagePath: 'g/free.png' }))
    expect(res.success).toBe(true)
  })
})
