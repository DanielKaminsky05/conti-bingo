import { describe, it, expect } from 'vitest'
import {
  buildIdenticalLayout,
  buildShuffledLayout,
  freeSpacePosition,
  requiredChallengeCount,
  type LayoutCell,
} from '@/lib/bingo/layout'

/**
 * Unit tests for player-card layout materialization (P1).
 * - identical mode: positions follow challenge order; free center pre-marked (odd grids).
 * - shuffled mode: deterministic per-seed permutation, no repeats/omissions.
 * - free space only valid on odd grids (D6); insufficient pool rejected.
 */

/** Generate n distinct challenge-id strings. */
const ids = (n: number) => Array.from({ length: n }, (_, i) => `ch-${i}`)

/** The non-free challenge ids in position order. */
const placedIds = (cells: LayoutCell[]) =>
  cells.filter((c) => c.challengeId !== null).map((c) => c.challengeId)

describe('freeSpacePosition', () => {
  it('is the center on odd grids and null on even grids', () => {
    expect(freeSpacePosition(5)).toBe(12) // (25-1)/2
    expect(freeSpacePosition(4)).toBeNull()
    expect(freeSpacePosition(6)).toBeNull()
  })
})

describe('requiredChallengeCount', () => {
  it('subtracts one for the free space, otherwise the full grid', () => {
    expect(requiredChallengeCount(5, true)).toBe(24)
    expect(requiredChallengeCount(5, false)).toBe(25)
    expect(requiredChallengeCount(4, false)).toBe(16)
    expect(requiredChallengeCount(6, false)).toBe(36)
  })
})

describe('buildIdenticalLayout', () => {
  it('produces exactly gridSize² cells with unique positions 0..n²−1', () => {
    for (const [n, free] of [
      [4, false],
      [5, true],
      [6, false],
    ] as const) {
      const cells = buildIdenticalLayout(ids(requiredChallengeCount(n, free)), n, free)
      expect(cells).toHaveLength(n * n)
      const positions = cells.map((c) => c.position).sort((a, b) => a - b)
      expect(positions).toEqual(Array.from({ length: n * n }, (_, i) => i))
      // positions are unique
      expect(new Set(positions).size).toBe(n * n)
    }
  })

  it('pre-marks the free center on a 5×5 and nothing else', () => {
    const cells = buildIdenticalLayout(ids(24), 5, true)
    const center = cells.find((c) => c.position === 12)!
    expect(center.challengeId).toBeNull()
    expect(center.isMarked).toBe(true)
    // no other cell is marked, and no other cell is the free space
    for (const c of cells) {
      if (c.position === 12) continue
      expect(c.isMarked).toBe(false)
      expect(c.challengeId).not.toBeNull()
    }
  })

  it('places challenges in order, each non-free cell mapping a distinct challenge', () => {
    const pool = ids(24)
    const cells = buildIdenticalLayout(pool, 5, true)
    const placed = placedIds(cells)
    // 24 non-free cells, all distinct, exactly the pool
    expect(placed).toHaveLength(24)
    expect(new Set(placed).size).toBe(24)
    expect([...placed].sort()).toEqual([...pool].sort())
    // order: pool[0] at position 0, pool skips the free center at 12
    expect(cells[0].challengeId).toBe(pool[0])
    expect(cells[11].challengeId).toBe(pool[11])
    expect(cells[13].challengeId).toBe(pool[12]) // after the free gap
  })

  it('uses every position for a challenge on an even grid (no free space)', () => {
    const pool = ids(16)
    const cells = buildIdenticalLayout(pool, 4, false)
    expect(placedIds(cells)).toHaveLength(16)
    expect(cells.every((c) => !c.isMarked)).toBe(true)
    expect(cells.every((c) => c.challengeId !== null)).toBe(true)
  })

  it('ignores extra challenges beyond what the grid needs', () => {
    const cells = buildIdenticalLayout(ids(30), 5, true)
    expect(cells).toHaveLength(25)
    expect(placedIds(cells)).toHaveLength(24)
  })

  it('throws when there are too few challenges', () => {
    expect(() => buildIdenticalLayout(ids(23), 5, true)).toThrow()
    expect(() => buildIdenticalLayout(ids(15), 4, false)).toThrow()
  })

  it('throws when free space is requested on an even grid (D6)', () => {
    // Provide enough ids so the failure is the free-space rule, not the count.
    expect(() => buildIdenticalLayout(ids(36), 4, true)).toThrow()
    expect(() => buildIdenticalLayout(ids(36), 6, true)).toThrow()
  })
})

describe('buildShuffledLayout', () => {
  it('is deterministic for a fixed seed', () => {
    const pool = ids(24)
    const a = buildShuffledLayout(pool, 5, true, 12345)
    const b = buildShuffledLayout(pool, 5, true, 12345)
    expect(placedIds(a)).toEqual(placedIds(b))
  })

  it('produces a different order than identical for most seeds', () => {
    const pool = ids(24)
    const identical = placedIds(buildIdenticalLayout(pool, 5, true))
    let differing = 0
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1)
    for (const seed of seeds) {
      const shuffled = placedIds(buildShuffledLayout(pool, 5, true, seed))
      // same multiset...
      expect([...shuffled].sort()).toEqual([...identical].sort())
      // ...but usually a different arrangement
      if (JSON.stringify(shuffled) !== JSON.stringify(identical)) differing++
    }
    expect(differing).toBeGreaterThanOrEqual(seeds.length - 1)
  })

  it('different seeds generally yield different arrangements', () => {
    const pool = ids(24)
    const a = placedIds(buildShuffledLayout(pool, 5, true, 1))
    const b = placedIds(buildShuffledLayout(pool, 5, true, 2))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('has no repeats or omissions (a true permutation of the pool)', () => {
    const pool = ids(24)
    const placed = placedIds(buildShuffledLayout(pool, 5, true, 999))
    expect(placed).toHaveLength(24)
    expect(new Set(placed).size).toBe(24)
    expect([...placed].sort()).toEqual([...pool].sort())
  })

  it('keeps the free center pre-marked after shuffling (5×5)', () => {
    const cells = buildShuffledLayout(ids(24), 5, true, 7)
    const center = cells.find((c) => c.position === 12)!
    expect(center.challengeId).toBeNull()
    expect(center.isMarked).toBe(true)
    expect(cells.filter((c) => c.isMarked)).toHaveLength(1)
  })

  it('fills every cell / unique positions on even grids too', () => {
    const cells = buildShuffledLayout(ids(16), 4, false, 42)
    expect(cells).toHaveLength(16)
    expect(new Set(cells.map((c) => c.position)).size).toBe(16)
    expect(placedIds(cells)).toHaveLength(16)
  })

  it('rejects an insufficient challenge count', () => {
    expect(() => buildShuffledLayout(ids(23), 5, true, 1)).toThrow()
  })

  it('rejects free space on even grids (D6)', () => {
    expect(() => buildShuffledLayout(ids(36), 6, true, 1)).toThrow()
  })
})
