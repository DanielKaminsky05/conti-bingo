import { describe, it, expect } from 'vitest'
import {
  aggregateCoopContributions,
  rankCoopContributions,
  type CoopMarkRow,
} from '@/lib/bingo/coop-standings'

function mark(userId: string, points = 1, markedAt: string | null = null): CoopMarkRow {
  return { userId, name: userId, avatarPath: null, points, markedAt }
}

describe('aggregateCoopContributions', () => {
  it('counts squares and sums points per marker', () => {
    const rows = [mark('a', 1), mark('a', 2), mark('b', 1)]
    const out = aggregateCoopContributions(rows)
    expect(out).toHaveLength(2)
    const a = out.find((r) => r.userId === 'a')!
    expect(a.squares).toBe(2)
    expect(a.points).toBe(3)
    const b = out.find((r) => r.userId === 'b')!
    expect(b.squares).toBe(1)
  })

  it('ignores rows without a marker', () => {
    const out = aggregateCoopContributions([mark(''), mark('a')])
    expect(out).toHaveLength(1)
    expect(out[0].userId).toBe('a')
  })

  it('tracks the earliest mark per user', () => {
    const out = aggregateCoopContributions([
      mark('a', 1, '2026-10-02T12:00:00.000Z'),
      mark('a', 1, '2026-10-01T12:00:00.000Z'),
    ])
    expect(out[0].firstMarkedAt).toBe('2026-10-01T12:00:00.000Z')
  })
})

describe('rankCoopContributions', () => {
  it('ranks by squares desc, then points desc, then earliest mark', () => {
    const out = rankCoopContributions([
      { userId: 'a', name: 'a', avatarPath: null, squares: 3, points: 3, firstMarkedAt: null },
      { userId: 'b', name: 'b', avatarPath: null, squares: 5, points: 5, firstMarkedAt: null },
      { userId: 'c', name: 'c', avatarPath: null, squares: 5, points: 9, firstMarkedAt: null },
    ])
    expect(out.map((r) => r.userId)).toEqual(['c', 'b', 'a'])
  })

  it('breaks square+point ties by earliest first mark', () => {
    const out = rankCoopContributions([
      {
        userId: 'late',
        name: 'late',
        avatarPath: null,
        squares: 2,
        points: 2,
        firstMarkedAt: '2026-10-02T00:00:00.000Z',
      },
      {
        userId: 'early',
        name: 'early',
        avatarPath: null,
        squares: 2,
        points: 2,
        firstMarkedAt: '2026-10-01T00:00:00.000Z',
      },
    ])
    expect(out.map((r) => r.userId)).toEqual(['early', 'late'])
  })
})
