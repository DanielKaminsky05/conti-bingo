# Test Conventions (for agents)

Project: **conti-bingo**. Vitest is configured (`vitest.config.ts`, `test/setup.ts`).
Read alongside: `api-endpoints.md` (your bucket's **Test cases**), `test-plan.md`, `data-model.md`.

## Two kinds of tests
- **Unit** → `test/unit/<name>.test.ts`. Pure logic (`@/lib/bingo/*`) and Zod validation schemas
  (`@/lib/validation/*`). No network. **Must pass now** via `npx vitest run test/unit/<name>.test.ts`.
- **Integration** → `test/integration/<domain>.int.test.ts`. Exercise the DATABASE behavior the
  endpoints rely on, AS real users. Import from `@/test/helpers/supabase`:
  `createTestUser`, `admin`, `anonClient`, `deleteTestUsers`, `hasServiceRole`.
  - Wrap the whole suite so it SKIPS without the service key:
    `describe.skipIf(!hasServiceRole)('<domain> (integration)', () => { ... })`.
  - `createTestUser()` returns `{ id, client, ... }` where `client` is signed in as that user, so
    **RLS applies**. Call Supabase (`client.from(...)`, `client.rpc(...)`, `client.storage...`) and
    the documented RPCs directly. Do **NOT** import the Server Action functions — they need a Next
    request context; replicate their Supabase calls as the authed user instead.
  - Create your own users/groups per test; clean up in `afterAll` with `deleteTestUsers(...)`
    (cascades remove their data). Use unique values to avoid collisions.

## Coverage
Cover the documented cases INCLUDING the negatives that matter here:
- **unauthenticated** (anon client) is rejected,
- **wrong role** (member attempting admin/owner action) is blocked,
- **wrong owner / wrong group** (IDOR) — a user cannot read/write another's rows,
- **validation** failures rejected,
- **idempotency** where relevant (join, getOrCreatePlayerCard, mark→bingo).
Assertions must be meaningful (assert the actual row state / error, not just "did not throw").
Create ONLY your bucket's test files. Do not modify source or other buckets' tests.
