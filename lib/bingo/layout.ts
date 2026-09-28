/**
 * Builds a player's card layout (position -> challenge mapping). Supports both
 * `identical` (positions follow challenge order) and `shuffled` (deterministic
 * per-seed permutation) modes. Free space is only valid on odd grids (5x5) and
 * occupies the center cell, pre-marked.
 */

export type LayoutCell = {
  position: number
  challengeId: string | null // null => free space
  isMarked: boolean
}

export function freeSpacePosition(gridSize: number): number | null {
  if (gridSize % 2 === 0) return null
  return (gridSize * gridSize - 1) / 2
}

/** Number of challenge cells a grid needs given the free-space setting. */
export function requiredChallengeCount(gridSize: number, freeSpace: boolean): number {
  return gridSize * gridSize - (freeSpace ? 1 : 0)
}

function assertEnough(challengeIds: string[], gridSize: number, freeSpace: boolean) {
  const needed = requiredChallengeCount(gridSize, freeSpace)
  if (challengeIds.length < needed) {
    throw new Error(
      `Not enough challenges: need ${needed} for a ${gridSize}x${gridSize} card` +
        `${freeSpace ? ' with free space' : ''}, got ${challengeIds.length}.`
    )
  }
  if (freeSpace && gridSize % 2 === 0) {
    throw new Error('Free space is only allowed on odd grids (e.g. 5x5).')
  }
}

/** Place `challengeIds` in order; free center cell (odd grids) is pre-marked. */
export function buildIdenticalLayout(
  challengeIds: string[],
  gridSize: number,
  freeSpace: boolean
): LayoutCell[] {
  assertEnough(challengeIds, gridSize, freeSpace)
  const free = freeSpace ? freeSpacePosition(gridSize) : null
  const cells: LayoutCell[] = []
  let next = 0
  for (let position = 0; position < gridSize * gridSize; position++) {
    if (position === free) {
      cells.push({ position, challengeId: null, isMarked: true })
    } else {
      cells.push({ position, challengeId: challengeIds[next++], isMarked: false })
    }
  }
  return cells
}

/** Deterministic per-seed shuffle, then identical placement. */
export function buildShuffledLayout(
  challengeIds: string[],
  gridSize: number,
  freeSpace: boolean,
  seed: number
): LayoutCell[] {
  assertEnough(challengeIds, gridSize, freeSpace)
  return buildIdenticalLayout(shuffle(challengeIds, seed), gridSize, freeSpace)
}

/** Deterministic Fisher-Yates using a mulberry32 PRNG seeded by `seed`. */
export function shuffle<T>(input: readonly T[], seed: number): T[] {
  const arr = input.slice()
  const rand = mulberry32(seed >>> 0)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
