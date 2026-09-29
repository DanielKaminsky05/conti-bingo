import { describe, it, expect } from 'vitest'
import {
  aggregateCompletions,
  type CompletionRow,
} from '@/lib/bingo/completions'

/**
 * Unit tests for the pure per-challenge completion aggregation (P4).
 * Rows → Record<challengeId, { count, users }>. De-dupes per (challenge, user),
 * ignores unmarked / null-challenge rows.
 */

const row = (
  challengeId: string | null,
  isMarked: boolean,
  userId: string,
  name: string | null = `User ${userId}`,
  avatarPath: string | null = null
): CompletionRow => ({ challengeId, isMarked, userId, name, avatarPath })

describe('aggregateCompletions', () => {
  it('counts distinct users per challenge with their profiles', () => {
    const result = aggregateCompletions([
      row('c1', true, 'u1', 'Alice', 'avatars/u1.png'),
      row('c1', true, 'u2', 'Bob', null),
      row('c2', true, 'u1', 'Alice', 'avatars/u1.png'),
    ])

    expect(result['c1'].count).toBe(2)
    expect(result['c1'].users).toEqual([
      { id: 'u1', name: 'Alice', avatarPath: 'avatars/u1.png' },
      { id: 'u2', name: 'Bob', avatarPath: null },
    ])
    expect(result['c2'].count).toBe(1)
    expect(result['c2'].users).toEqual([
      { id: 'u1', name: 'Alice', avatarPath: 'avatars/u1.png' },
    ])
  })

  it('de-duplicates the same user on the same challenge', () => {
    const result = aggregateCompletions([
      row('c1', true, 'u1', 'Alice'),
      row('c1', true, 'u1', 'Alice'),
      row('c1', true, 'u1', 'Alice'),
    ])
    expect(result['c1'].count).toBe(1)
    expect(result['c1'].users).toHaveLength(1)
  })

  it('ignores unmarked rows', () => {
    const result = aggregateCompletions([
      row('c1', false, 'u1'),
      row('c1', true, 'u2'),
    ])
    expect(result['c1'].count).toBe(1)
    expect(result['c1'].users.map((u) => u.id)).toEqual(['u2'])
  })

  it('ignores rows with a null challenge (e.g. free space)', () => {
    const result = aggregateCompletions([
      row(null, true, 'u1'),
      row('c1', true, 'u1'),
    ])
    expect(Object.keys(result)).toEqual(['c1'])
    expect(result['c1'].count).toBe(1)
  })

  it('ignores rows with an empty userId', () => {
    const result = aggregateCompletions([row('c1', true, '')])
    expect(result).toEqual({})
  })

  it('falls back to "Player" for blank/null names', () => {
    const result = aggregateCompletions([
      row('c1', true, 'u1', null),
      row('c2', true, 'u2', '   '),
    ])
    expect(result['c1'].users[0].name).toBe('Player')
    expect(result['c2'].users[0].name).toBe('Player')
  })

  it('returns an empty object for no rows', () => {
    expect(aggregateCompletions([])).toEqual({})
  })
})
