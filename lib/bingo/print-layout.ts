/**
 * Pure layout math for the printable (PDF) card — no jsPDF, no DOM, so it's
 * unit-testable. Units are PDF points (1/72 in). Matches the reference
 * bingo.pdf: US Letter, a centered title, then a square grid with thin borders.
 */

export type PrintSquare = {
  /** Challenge text (null for image-only squares and the free space). */
  text: string | null
  /** Public image URL, if the square has one. */
  imageUrl: string | null
  free: boolean
}

export type PrintCell = { position: number; challengeId: string | null }
export type PrintChallenge = { text: string | null; imageUrl: string | null }

export const PAGE = { width: 612, height: 792 } as const // US Letter
const GRID_LEFT = 51
const GRID_WIDTH = PAGE.width - GRID_LEFT * 2
const GRID_TOP = 100
const TITLE_BASELINE = 80
const TITLE_SIZE = 40
/** Inner padding of a square, as a fraction of its side. */
const PAD = 0.06
/** Image + caption squares: the image takes the top share, text the rest. */
const IMAGE_SHARE = 0.62

export const FREE_LABEL = 'Free!'
export const TITLE = 'Contibingo'

export type Rect = { x: number; y: number; w: number; h: number }

export function pageGeometry(gridSize: number) {
  const cell = GRID_WIDTH / gridSize
  return {
    title: { text: TITLE, x: PAGE.width / 2, y: TITLE_BASELINE, size: TITLE_SIZE },
    grid: { x: GRID_LEFT, y: GRID_TOP, size: GRID_WIDTH, cell },
  }
}

/** Outer rect of the square at `position` (row-major). */
export function squareRect(gridSize: number, position: number): Rect {
  const { grid } = pageGeometry(gridSize)
  return {
    x: grid.x + (position % gridSize) * grid.cell,
    y: grid.y + Math.floor(position / gridSize) * grid.cell,
    w: grid.cell,
    h: grid.cell,
  }
}

/** Content regions inside a square for its image and/or text. */
export function squareContent(
  rect: Rect,
  hasImage: boolean,
  hasText: boolean
): { image: Rect | null; text: Rect | null } {
  const pad = rect.w * PAD
  const inner = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2 }
  if (hasImage && hasText) {
    const ih = inner.h * IMAGE_SHARE
    const gap = inner.h * 0.03
    return {
      image: { ...inner, h: ih },
      text: { x: inner.x, y: inner.y + ih + gap, w: inner.w, h: inner.h - ih - gap },
    }
  }
  return { image: hasImage ? inner : null, text: hasText ? inner : null }
}

/** Scale an image of natural size w×h to fit (contain) and center it in `box`. */
export function containRect(box: Rect, w: number, h: number): Rect {
  const s = Math.min(box.w / w, box.h / h)
  const iw = w * s
  const ih = h * s
  return { x: box.x + (box.w - iw) / 2, y: box.y + (box.h - ih) / 2, w: iw, h: ih }
}

/** Width of `text` at font `size` (points). Injected so this module stays pure. */
export type Measure = (text: string, size: number) => number

export const LINE_HEIGHT = 1.15

/**
 * Wrap `text` into lines at the largest font size (≤ max) that fits `w`×`h`
 * WITHOUT splitting words — the size shrinks until the longest word fits on a
 * line. Only a single word wider than the box at `min` size is hard-broken.
 */
export function fitText(
  text: string,
  w: number,
  h: number,
  measure: Measure,
  max = 18,
  min = 6
): { size: number; lines: string[] } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { size: max, lines: [] }

  for (let size = max; size >= min; size -= 0.5) {
    if (words.some((word) => measure(word, size) > w)) continue
    const lines = wrapWords(words, w, size, measure)
    if (lines.length * size * LINE_HEIGHT <= h) return { size, lines }
  }

  // Last resort (e.g. one enormous word): smallest size, break inside words.
  const lines: string[] = []
  for (const line of wrapWords(words, w, min, measure)) {
    lines.push(...breakWord(line, w, min, measure))
  }
  return { size: min, lines }
}

function wrapWords(words: string[], w: number, size: number, measure: Measure): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next, size) > w) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function breakWord(text: string, w: number, size: number, measure: Measure): string[] {
  if (measure(text, size) <= w) return [text]
  const out: string[] = []
  let chunk = ''
  for (const ch of text) {
    if (chunk && measure(chunk + ch, size) > w) {
      out.push(chunk)
      chunk = ch
    } else {
      chunk += ch
    }
  }
  if (chunk) out.push(chunk)
  return out
}

/**
 * The PDF uses the standard Helvetica font (WinAnsi encoding). Characters it
 * can't encode — emoji, CJK, most symbols — would print as garbage, so drop
 * them. Latin-1 plus the common typographic extras are kept.
 */
const WINANSI_EXTRAS = new Set('–—‘’‚“”„•…€™‹›†‡ˆ‰Šš Œœ Žž Ÿƒ˜'.replace(/ /g, ''))
export function printableText(text: string): string {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WINANSI_EXTRAS.has(ch)) {
      out += ch
    } else if (ch === '\n' || ch === '\t') {
      out += ' '
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Turn a card's cell list (position → challenge, null = free space) into the
 * squares to print, in position order. Missing challenges print blank.
 */
export function composeSquares(
  gridSize: number,
  cells: PrintCell[],
  challenges: Record<string, PrintChallenge>,
  freeImageUrl: string | null
): PrintSquare[] {
  const byPos = new Map(cells.map((c) => [c.position, c.challengeId]))
  return Array.from({ length: gridSize * gridSize }, (_, position) => {
    if (!byPos.has(position)) return { text: null, imageUrl: null, free: false }
    const id = byPos.get(position)
    if (id === null) return { text: null, imageUrl: freeImageUrl, free: true }
    const ch = id ? challenges[id] : undefined
    const text = ch?.text ? printableText(ch.text) : ''
    return { text: text || null, imageUrl: ch?.imageUrl ?? null, free: false }
  })
}

/** "Week 3 — Cold calls!" → "contibingo-week-3-cold-calls.pdf" */
export function pdfFileName(cardTitle: string): string {
  const slug = cardTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // é → e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug ? `contibingo-${slug}.pdf` : 'contibingo.pdf'
}
