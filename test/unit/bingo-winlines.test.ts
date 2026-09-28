import { describe, it, expect } from 'vitest'
import { linesFor, completedLines, isBlackout } from '@/lib/bingo/winlines'

/**
 * Unit tests for win-line geometry (P3/L2 — `check_bingo` mirror).
 * Positions are 0..(n²−1), row-major: row = pos / n, col = pos % n.
 * `line_key`s MUST be `row-{r}`, `col-{c}`, `diag-0` (main), `diag-1` (anti).
 */

/** Positions of a full row r on an n×n grid. */
const row = (r: number, n: number) => Array.from({ length: n }, (_, c) => r * n + c)
/** Positions of a full column c on an n×n grid. */
const col = (c: number, n: number) => Array.from({ length: n }, (_, r) => r * n + c)
/** Positions of the main diagonal on an n×n grid. */
const diag0 = (n: number) => Array.from({ length: n }, (_, i) => i * n + i)
/** Positions of the anti-diagonal on an n×n grid. */
const diag1 = (n: number) => Array.from({ length: n }, (_, i) => i * n + (n - 1 - i))
/** All positions of an n×n grid. */
const allCells = (n: number) => Array.from({ length: n * n }, (_, i) => i)

describe('linesFor', () => {
  it('returns 2n + 2 lines with the documented keys for n×n', () => {
    for (const n of [4, 5, 6]) {
      const lines = linesFor(n)
      expect(lines).toHaveLength(2 * n + 2)
      const keys = lines.map((l) => l.key)
      for (let r = 0; r < n; r++) expect(keys).toContain(`row-${r}`)
      for (let c = 0; c < n; c++) expect(keys).toContain(`col-${c}`)
      expect(keys).toContain('diag-0')
      expect(keys).toContain('diag-1')
      // every line spans exactly n cells
      for (const line of lines) expect(line.positions).toHaveLength(n)
    }
  })
})

describe('completedLines', () => {
  for (const n of [4, 5, 6]) {
    describe(`${n}×${n}`, () => {
      it('detects a full row', () => {
        const r = 1
        expect(completedLines(row(r, n), n)).toEqual([`row-${r}`])
      })

      it('detects a full column', () => {
        const c = 2
        expect(completedLines(col(c, n), n)).toEqual([`col-${c}`])
      })

      it('detects the main diagonal (diag-0)', () => {
        expect(completedLines(diag0(n), n)).toEqual(['diag-0'])
      })

      it('detects the anti-diagonal (diag-1)', () => {
        expect(completedLines(diag1(n), n)).toEqual(['diag-1'])
      })

      it('returns no lines for a partial row (one cell short)', () => {
        const marked = row(0, n).slice(0, n - 1)
        expect(completedLines(marked, n)).toEqual([])
      })

      it('returns no lines for a partial column (one cell short)', () => {
        const marked = col(0, n).slice(0, n - 1)
        expect(completedLines(marked, n)).toEqual([])
      })

      it('returns no lines for an empty grid', () => {
        expect(completedLines([], n)).toEqual([])
      })

      it('reports every completed line when the whole grid is marked', () => {
        const keys = completedLines(allCells(n), n)
        for (let r = 0; r < n; r++) expect(keys).toContain(`row-${r}`)
        for (let c = 0; c < n; c++) expect(keys).toContain(`col-${c}`)
        expect(keys).toContain('diag-0')
        expect(keys).toContain('diag-1')
        expect(keys).toHaveLength(2 * n + 2)
      })

      it('accepts a Set as well as an array', () => {
        expect(completedLines(new Set(row(0, n)), n)).toEqual(['row-0'])
      })
    })
  }

  it('a marked free center participates in its row/col/diagonals on 5×5', () => {
    const n = 5
    const center = 12 // (5*5-1)/2
    // The center sits on row-2, col-2, diag-0 and diag-1.
    // Complete row 2 including the (already-marked) free center.
    expect(completedLines(row(2, n), n)).toEqual(['row-2'])
    // Complete the main diagonal, which passes through the center.
    expect(completedLines(diag0(n), n)).toEqual(['diag-0'])
    // Complete the anti-diagonal, which also passes through the center.
    expect(completedLines(diag1(n), n)).toEqual(['diag-1'])
    // Sanity: the center is a member of exactly those four lines.
    const throughCenter = linesFor(n)
      .filter((l) => l.positions.includes(center))
      .map((l) => l.key)
      .sort()
    expect(throughCenter).toEqual(['col-2', 'diag-0', 'diag-1', 'row-2'])
  })
})

describe('isBlackout', () => {
  for (const n of [4, 5, 6]) {
    it(`is true only when every cell of a ${n}×${n} grid is marked`, () => {
      expect(isBlackout(allCells(n), n)).toBe(true)
      // one short → false
      expect(isBlackout(allCells(n).slice(0, n * n - 1), n)).toBe(false)
      // empty → false
      expect(isBlackout([], n)).toBe(false)
    })
  }

  it('is false when the count is right but a cell is missing (duplicate/out-of-range noise)', () => {
    const n = 4
    // n²=16 entries but position 0 is missing and 99 is extraneous.
    const marked = [99, ...allCells(n).slice(1)]
    expect(marked).toHaveLength(n * n)
    expect(isBlackout(marked, n)).toBe(false)
  })

  it('accepts a Set', () => {
    const n = 5
    expect(isBlackout(new Set(allCells(n)), n)).toBe(true)
  })
})
