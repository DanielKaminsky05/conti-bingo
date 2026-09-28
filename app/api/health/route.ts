/**
 * O1 — Liveness check. Public, no auth, no data access; returns a fixed 200 body
 * and leaks no build/internal details.
 */
export function GET(): Response {
  return Response.json({ status: 'ok' })
}
