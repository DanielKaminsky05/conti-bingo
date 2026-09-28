/**
 * Shared result + error conventions for Server Actions.
 *
 * Convention: actions return `ActionResult<T>` for expected outcomes (including
 * validation and authorization failures) so the UI can render them, and reserve
 * `throw` for truly unexpected/internal errors. Use `ActionError` when you want a
 * coded failure to bubble; `toActionResult` normalizes a thrown `ActionError`.
 */

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'error'

export class ActionError extends Error {
  code: ActionErrorCode
  constructor(code: ActionErrorCode, message: string) {
    super(message)
    this.name = 'ActionError'
    this.code = code
  }
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(code: ActionErrorCode, error: string): ActionResult<never> {
  return { ok: false, code, error }
}

/** Run an action body, converting thrown ActionErrors into ActionResult failures. */
export async function withResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn())
  } catch (e) {
    if (e instanceof ActionError) return fail(e.code, e.message)
    throw e
  }
}
