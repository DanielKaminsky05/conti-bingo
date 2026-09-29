/**
 * PURE aggregation for "who completed which challenge" (no Supabase/React imports).
 *
 * Given flat rows of marked player-card cells joined to their player's profile,
 * produce a per-challenge map of the distinct users who have that challenge
 * marked, plus a count. De-duplicates per (challenge, user): the same user can
 * only appear once per challenge even if the data contains duplicate rows.
 *
 * Rows with a null `challengeId` (e.g. the free space) or `isMarked === false`
 * are ignored so callers can pass unfiltered rows safely.
 */

export type CompletionRow = {
  challengeId: string | null
  isMarked: boolean
  userId: string
  name: string | null
  avatarPath: string | null
}

export type CompletionUser = {
  id: string
  name: string
  avatarPath: string | null
}

export type ChallengeCompletion = {
  count: number
  users: CompletionUser[]
}

/** challenge_id → { count, users } */
export type ChallengeCompletions = Record<string, ChallengeCompletion>

/**
 * Aggregate marked cells into a per-challenge completion map.
 * Only `isMarked` rows with a non-null `challengeId` contribute; each user is
 * counted at most once per challenge.
 */
export function aggregateCompletions(rows: CompletionRow[]): ChallengeCompletions {
  const out: ChallengeCompletions = {}
  // Track which users we've already recorded per challenge to de-dupe.
  const seen = new Map<string, Set<string>>()

  for (const row of rows) {
    if (!row.isMarked) continue
    if (!row.challengeId) continue
    if (!row.userId) continue

    let userSet = seen.get(row.challengeId)
    if (!userSet) {
      userSet = new Set<string>()
      seen.set(row.challengeId, userSet)
      out[row.challengeId] = { count: 0, users: [] }
    }
    if (userSet.has(row.userId)) continue
    userSet.add(row.userId)

    out[row.challengeId].users.push({
      id: row.userId,
      name: row.name?.trim() || "Player",
      avatarPath: row.avatarPath ?? null,
    })
    out[row.challengeId].count += 1
  }

  return out
}
