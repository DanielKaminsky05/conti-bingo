/**
 * Win-line geometry for a bingo grid. These `line_key` values MUST match the
 * database trigger `public.check_bingo` exactly: `row-{r}`, `col-{c}`,
 * `diag-0` (main), `diag-1` (anti). Positions are 0..(gridSize^2 - 1),
 * row-major (row = pos / n, col = pos % n).
 */

export type Line = { key: string; positions: number[] }

/** All winning lines (rows, columns, both diagonals) for an n x n grid. */
export function linesFor(gridSize: number): Line[] {
  const n = gridSize
  const lines: Line[] = []
  for (let r = 0; r < n; r++) {
    lines.push({ key: `row-${r}`, positions: Array.from({ length: n }, (_, c) => r * n + c) })
  }
  for (let c = 0; c < n; c++) {
    lines.push({ key: `col-${c}`, positions: Array.from({ length: n }, (_, r) => r * n + c) })
  }
  lines.push({ key: 'diag-0', positions: Array.from({ length: n }, (_, i) => i * n + i) })
  lines.push({ key: 'diag-1', positions: Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)) })
  return lines
}

/** Keys of the lines fully covered by `marked`. */
export function completedLines(marked: Iterable<number>, gridSize: number): string[] {
  const set = marked instanceof Set ? marked : new Set(marked)
  return linesFor(gridSize)
    .filter((line) => line.positions.every((p) => set.has(p)))
    .map((line) => line.key)
}

/** True when every cell on the grid is marked. */
export function isBlackout(marked: Iterable<number>, gridSize: number): boolean {
  const set = marked instanceof Set ? marked : new Set(marked)
  const total = gridSize * gridSize
  if (set.size < total) return false
  for (let p = 0; p < total; p++) {
    if (!set.has(p)) return false
  }
  return true
}
