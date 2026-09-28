import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

/**
 * Unit test for the Ops liveness route (O1 GET /api/health).
 * Contract (api-endpoints.md O1): returns 200 { status: 'ok' }; no auth, no data access,
 * and leaks no build/internal info.
 */

describe('GET /api/health', () => {
  it('returns a 200 response', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('returns JSON body { status: "ok" }', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
  })

  it('does not leak build/internal fields in the body', async () => {
    const res = await GET()
    const body = await res.json()
    // Only the single documented key is present.
    expect(Object.keys(body)).toEqual(['status'])
  })
})
