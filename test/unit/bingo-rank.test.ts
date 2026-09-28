import { describe, it, expect } from 'vitest'
import { rankPlayers, type LeaderboardEntry } from '@/lib/bingo/rank'

/**
 * Unit tests for leaderboard ordering (L1).
 * Order: bingo_count desc → points_total desc → marks_count desc → earliest first_bingo_at.
 * Zero-mark players are included; nulls (never bingoed) sort last on the tie-break.
 */

const entry = (
  user_id: string,
  bingo_count: number,
  points_total: number,
  marks_count: number,
  first_bingo_at: string | null = null
): LeaderboardEntry => ({ user_id, bingo_count, points_total, marks_count, first_bingo_at })

/** The ranked user_ids, for terse assertions. */
const order = (rows: LeaderboardEntry[]) => rankPlayers(rows).map((r) => r.user_id)

describe('rankPlayers', () => {
  it('orders by bingo_count desc first', () => {
    const rows = [entry('a', 1, 100, 20), entry('b', 3, 1, 3), entry('c', 2, 50, 10)]
    expect(order(rows)).toEqual(['b', 'c', 'a'])
  })

  it('breaks bingo ties by points_total desc', () => {
    const rows = [entry('a', 2, 30, 5), entry('b', 2, 90, 5), entry('c', 2, 60, 5)]
    expect(order(rows)).toEqual(['b', 'c', 'a'])
  })

  it('breaks bingo+points ties by marks_count desc', () => {
    const rows = [entry('a', 1, 50, 4), entry('b', 1, 50, 9), entry('c', 1, 50, 6)]
    expect(order(rows)).toEqual(['b', 'c', 'a'])
  })

  it('breaks remaining ties by earliest first_bingo_at', () => {
    const rows = [
      entry('late', 1, 50, 5, '2026-01-01T12:00:00.000Z'),
      entry('early', 1, 50, 5, '2026-01-01T09:00:00.000Z'),
      entry('mid', 1, 50, 5, '2026-01-01T10:30:00.000Z'),
    ]
    expect(order(rows)).toEqual(['early', 'mid', 'late'])
  })

  it('includes zero-mark players and sorts them last', () => {
    const rows = [
      entry('zero', 0, 0, 0, null),
      entry('winner', 1, 10, 3, '2026-01-01T00:00:00.000Z'),
    ]
    const ranked = rankPlayers(rows)
    expect(ranked.map((r) => r.user_id)).toEqual(['winner', 'zero'])
    expect(ranked).toHaveLength(2)
  })

  it('sorts a null first_bingo_at after a real timestamp on an otherwise-equal tie', () => {
    // Equal bingo/points/marks; the one who bingoed earlier (non-null) wins.
    const rows = [
      entry('nulltime', 1, 20, 5, null),
      entry('timed', 1, 20, 5, '2026-05-05T05:05:05.000Z'),
    ]
    expect(order(rows)).toEqual(['timed', 'nulltime'])
  })

  it('is deterministic and stable across the full precedence chain', () => {
    const rows = [
      entry('p3', 2, 40, 8, '2026-02-01T00:00:00.000Z'),
      entry('p1', 3, 10, 2, '2026-02-01T00:00:00.000Z'),
      entry('p5', 0, 0, 0, null),
      entry('p2', 2, 40, 8, '2026-01-01T00:00:00.000Z'),
      entry('p4', 2, 40, 4, '2026-01-01T00:00:00.000Z'),
    ]
    const first = order(rows)
    expect(first).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    // running again on a reshuffled copy yields the same order
    const reshuffled = [rows[4], rows[0], rows[2], rows[3], rows[1]]
    expect(order(reshuffled)).toEqual(first)
  })

  it('does not mutate the input array', () => {
    const rows = [entry('a', 1, 1, 1), entry('b', 2, 2, 2)]
    const snapshot = rows.map((r) => r.user_id)
    rankPlayers(rows)
    expect(rows.map((r) => r.user_id)).toEqual(snapshot)
  })
})
