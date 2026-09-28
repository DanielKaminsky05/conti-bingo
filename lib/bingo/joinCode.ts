/**
 * Join-code helpers. The database `create_group` RPC is the authoritative
 * generator; this mirrors the agreed format for any app-side needs and tests:
 * 6 chars from A-Z + 2-9, excluding ambiguous 0/O/1/I/L.
 */

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6

export function generateJoinCode(length = JOIN_CODE_LENGTH): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
  }
  return out
}

export function isValidJoinCode(code: string): boolean {
  const re = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`)
  return re.test(code.toUpperCase())
}
