/**
 * Leaderboard ranking. Mirrors the documented order for the `leaderboard` view:
 * bingos desc -> points desc -> squares desc -> earliest first_bingo_at.
 */

export type LeaderboardEntry = {
  user_id: string
  bingo_count: number
  points_total: number
  marks_count: number
  first_bingo_at: string | null
}

export function rankPlayers<T extends LeaderboardEntry>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (b.bingo_count !== a.bingo_count) return b.bingo_count - a.bingo_count
    if (b.points_total !== a.points_total) return b.points_total - a.points_total
    if (b.marks_count !== a.marks_count) return b.marks_count - a.marks_count
    // earliest first_bingo_at wins; nulls sort last
    const at = a.first_bingo_at ? Date.parse(a.first_bingo_at) : Number.POSITIVE_INFINITY
    const bt = b.first_bingo_at ? Date.parse(b.first_bingo_at) : Number.POSITIVE_INFINITY
    return at - bt
  })
}
