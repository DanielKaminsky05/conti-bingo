import { describe, it, expect } from 'vitest'
import {
  PAGE,
  TITLE,
  composeSquares,
  containRect,
  fitText,
  pageGeometry,
  pdfFileName,
  printableText,
  squareContent,
  squareRect,
  type Measure,
} from '@/lib/bingo/print-layout'

/**
 * Unit tests for the printable-card layout math (PDF download).
 * Uses a fake monospace measure: each char is 0.5em wide.
 */
const mono: Measure = (text, size) => text.length * size * 0.5

describe('pageGeometry / squareRect', () => {
  it('titles every card "Contibingo" and keeps the grid on a Letter page', () => {
    for (const n of [4, 5, 6]) {
      const { title, grid } = pageGeometry(n)
      expect(title.text).toBe(TITLE)
      expect(TITLE).toBe('Contibingo')
      expect(grid.x + grid.size).toBeLessThanOrEqual(PAGE.width)
      expect(grid.y + grid.size).toBeLessThanOrEqual(PAGE.height)
      expect(grid.cell * n).toBeCloseTo(grid.size)
    }
  })

  it('lays squares out row-major', () => {
    const a = squareRect(5, 0)
    const b = squareRect(5, 1)
    const c = squareRect(5, 5)
    expect(b.x).toBeCloseTo(a.x + a.w)
    expect(b.y).toBe(a.y)
    expect(c.x).toBe(a.x)
    expect(c.y).toBeCloseTo(a.y + a.h)
    const last = squareRect(5, 24)
    expect(last.x + last.w).toBeCloseTo(pageGeometry(5).grid.x + pageGeometry(5).grid.size)
  })
})

describe('squareContent', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 }

  it('splits image (top) and caption (bottom) without overlap', () => {
    const { image, text } = squareContent(rect, true, true)
    expect(image).not.toBeNull()
    expect(text).not.toBeNull()
    expect(image!.y + image!.h).toBeLessThanOrEqual(text!.y)
    expect(text!.y + text!.h).toBeLessThanOrEqual(rect.h)
  })

  it('gives a lone image or lone text the whole padded square', () => {
    expect(squareContent(rect, true, false).text).toBeNull()
    expect(squareContent(rect, false, true).image).toBeNull()
    expect(squareContent(rect, true, false).image).toEqual(squareContent(rect, false, true).text)
  })
})

describe('containRect', () => {
  it('fits a wide image to the box width and centers it vertically', () => {
    const r = containRect({ x: 0, y: 0, w: 100, h: 100 }, 400, 200)
    expect(r.w).toBeCloseTo(100)
    expect(r.h).toBeCloseTo(50)
    expect(r.y).toBeCloseTo(25)
  })

  it('fits a tall image to the box height and centers it horizontally', () => {
    const r = containRect({ x: 10, y: 10, w: 100, h: 100 }, 100, 400)
    expect(r.h).toBeCloseTo(100)
    expect(r.w).toBeCloseTo(25)
    expect(r.x).toBeCloseTo(10 + 37.5)
  })
})

describe('fitText', () => {
  it('keeps short text at the max size', () => {
    expect(fitText('Pivot', 100, 100, mono)).toEqual({ size: 18, lines: ['Pivot'] })
  })

  it('never splits a word across lines — shrinks instead', () => {
    // "stakeholders" (12 chars) at 18pt = 108 > 80 → must shrink until it fits.
    const { size, lines } = fitText('Talk about stakeholders', 80, 100, mono)
    expect(lines).toContain('stakeholders')
    expect(mono('stakeholders', size)).toBeLessThanOrEqual(80)
    for (const line of lines) expect(mono(line, size)).toBeLessThanOrEqual(80)
  })

  it('fits long text inside the box height', () => {
    const text =
      'Disagree respectfully with a classmate about the core recommendation of the case'
    const { size, lines } = fitText(text, 90, 90, mono)
    expect(lines.join(' ')).toBe(text)
    expect(lines.length * size * 1.15).toBeLessThanOrEqual(90)
    for (const line of lines) expect(mono(line, size)).toBeLessThanOrEqual(90)
  })

  it('hard-breaks only a single word too wide even at the minimum size', () => {
    const word = 'a'.repeat(60) // 60 × 6 × 0.5 = 180 > 50 at min size
    const { size, lines } = fitText(word, 50, 1000, mono)
    expect(size).toBe(6)
    expect(lines.join('')).toBe(word)
    for (const line of lines) expect(mono(line, size)).toBeLessThanOrEqual(50)
  })

  it('returns no lines for blank text', () => {
    expect(fitText('   ', 50, 50, mono).lines).toEqual([])
  })
})

describe('printableText', () => {
  it('keeps Latin-1 and common punctuation', () => {
    expect(printableText('Café — “quote” … 5€')).toBe('Café — “quote” … 5€')
  })

  it('drops emoji and other unencodable characters, collapsing whitespace', () => {
    expect(printableText('Get a laugh 😂  from 教授')).toBe('Get a laugh from')
    expect(printableText('line\nbreak')).toBe('line break')
  })
})

describe('composeSquares', () => {
  const challenges = {
    a: { text: 'Alpha', imageUrl: null },
    b: { text: null, imageUrl: 'https://img/b.jpg' },
    c: { text: 'Gamma 😂', imageUrl: 'https://img/c.jpg' },
  }

  it('orders squares by position and maps the free space', () => {
    const cells = [
      { position: 3, challengeId: 'a' },
      { position: 0, challengeId: 'c' },
      { position: 1, challengeId: null },
      { position: 2, challengeId: 'b' },
    ]
    expect(composeSquares(2, cells, challenges, 'https://img/free.jpg')).toEqual([
      { text: 'Gamma', imageUrl: 'https://img/c.jpg', free: false },
      { text: null, imageUrl: 'https://img/free.jpg', free: true },
      { text: null, imageUrl: 'https://img/b.jpg', free: false },
      { text: 'Alpha', imageUrl: null, free: false },
    ])
  })

  it('prints unknown or missing positions blank', () => {
    const squares = composeSquares(2, [{ position: 0, challengeId: 'zzz' }], challenges, null)
    expect(squares).toHaveLength(4)
    for (const s of squares) expect(s).toEqual({ text: null, imageUrl: null, free: false })
  })
})

describe('pdfFileName', () => {
  it('slugifies the card title', () => {
    expect(pdfFileName('Week 3 — Cold Calls!')).toBe('contibingo-week-3-cold-calls.pdf')
    expect(pdfFileName('Café Débat')).toBe('contibingo-cafe-debat.pdf')
  })

  it('falls back when nothing survives', () => {
    expect(pdfFileName('😂😂')).toBe('contibingo.pdf')
  })
})
