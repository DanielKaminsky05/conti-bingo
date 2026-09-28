import { describe, it, expect } from 'vitest'
import {
  generateJoinCode,
  isValidJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from '@/lib/bingo/joinCode'

/**
 * Unit tests for join-code helpers (G1/G6 mirror).
 * Format: 6 chars from A–Z + 2–9, excluding ambiguous 0/O/1/I/L.
 */

const AMBIGUOUS = ['0', 'O', '1', 'I', 'L']

describe('JOIN_CODE_ALPHABET', () => {
  it('excludes the ambiguous characters 0/O/1/I/L', () => {
    for (const ch of AMBIGUOUS) {
      expect(JOIN_CODE_ALPHABET).not.toContain(ch)
    }
  })

  it('contains only uppercase A–Z and digits 2–9', () => {
    expect(/^[A-Z2-9]+$/.test(JOIN_CODE_ALPHABET)).toBe(true)
  })
})

describe('generateJoinCode', () => {
  it('produces a code of the default length using only alphabet chars', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode()
      expect(code).toHaveLength(JOIN_CODE_LENGTH)
      for (const ch of code) {
        expect(JOIN_CODE_ALPHABET).toContain(ch)
        expect(AMBIGUOUS).not.toContain(ch)
      }
    }
  })

  it('respects a custom length', () => {
    expect(generateJoinCode(8)).toHaveLength(8)
    expect(generateJoinCode(4)).toHaveLength(4)
  })

  it('every generated code passes isValidJoinCode', () => {
    for (let i = 0; i < 200; i++) {
      expect(isValidJoinCode(generateJoinCode())).toBe(true)
    }
  })
})

describe('isValidJoinCode', () => {
  it('accepts a well-formed code', () => {
    expect(isValidJoinCode('ABCDEF')).toBe(true)
    expect(isValidJoinCode('P2Q3R4')).toBe(true)
  })

  it('rejects codes of the wrong length', () => {
    expect(isValidJoinCode('ABCDE')).toBe(false) // 5
    expect(isValidJoinCode('ABCDEFG')).toBe(false) // 7
    expect(isValidJoinCode('')).toBe(false)
  })

  it('rejects codes containing ambiguous characters', () => {
    expect(isValidJoinCode('ABCDE0')).toBe(false) // 0
    expect(isValidJoinCode('ABCDE1')).toBe(false) // 1
    expect(isValidJoinCode('ABCDEI')).toBe(false) // I
    expect(isValidJoinCode('ABCDEL')).toBe(false) // L
    expect(isValidJoinCode('ABCDEO')).toBe(false) // O
  })

  it('rejects non-alphabet characters (punctuation / spaces)', () => {
    expect(isValidJoinCode('ABC-EF')).toBe(false)
    expect(isValidJoinCode('ABC EF')).toBe(false)
    expect(isValidJoinCode('AB@DEF')).toBe(false)
  })
})
