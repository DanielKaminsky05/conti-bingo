/**
 * Co-op contributions standings. Pure logic (no React/Supabase) so it's unit
 * testable. In co-op mode the whole group fills one shared board; we credit each
 * marked square to whoever marked it and rank by squares contributed, then by
 * points, then by earliest contribution.
 */

export type CoopContributionRow = {
  userId: string
  name: string | null
  avatarPath: string | null
  squares: number
  points: number
  firstMarkedAt: string | null
}

/** One marked, attributed cell feeding the aggregation. */
export type CoopMarkRow = {
  userId: string
  name: string | null
  avatarPath: string | null
  points: number
  markedAt: string | null
}

/** Aggregate attributed marks into per-user contribution rows. */
export function aggregateCoopContributions(rows: readonly CoopMarkRow[]): CoopContributionRow[] {
  const byUser = new Map<string, CoopContributionRow>()
  for (const r of rows) {
    if (!r.userId) continue
    const existing = byUser.get(r.userId)
    if (existing) {
      existing.squares += 1
      existing.points += r.points
      if (
        r.markedAt &&
        (!existing.firstMarkedAt || Date.parse(r.markedAt) < Date.parse(existing.firstMarkedAt))
      ) {
        existing.firstMarkedAt = r.markedAt
      }
    } else {
      byUser.set(r.userId, {
        userId: r.userId,
        name: r.name,
        avatarPath: r.avatarPath,
        squares: 1,
        points: r.points,
        firstMarkedAt: r.markedAt,
      })
    }
  }
  return rankCoopContributions([...byUser.values()])
}

/** Rank by squares desc → points desc → earliest first mark. */
export function rankCoopContributions<T extends CoopContributionRow>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (b.squares !== a.squares) return b.squares - a.squares
    if (b.points !== a.points) return b.points - a.points
    const at = a.firstMarkedAt ? Date.parse(a.firstMarkedAt) : Number.POSITIVE_INFINITY
    const bt = b.firstMarkedAt ? Date.parse(b.firstMarkedAt) : Number.POSITIVE_INFINITY
    return at - bt
  })
}
