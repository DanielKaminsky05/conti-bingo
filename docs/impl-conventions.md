# Endpoint Implementation Conventions (for agents)

Project: **conti-bingo** — Next.js 16 App Router, React 19, Supabase (schema already applied).
Read alongside: `api-endpoints.md` (contract + roles + test cases), `data-model.md` (§9 RLS,
RPCs, revocable win trigger), `decisions.md` (D1–D7), `best-practices.md`.

## Reuse the shared foundation — do NOT re-implement or modify it
- Server client: `import { createClient } from '@/lib/supabase/server'` (typed with `Database`).
- Auth: `import { requireUser } from '@/lib/auth/session'` → `const { supabase, user } = await requireUser()`.
- Results: `import { ok, fail, withResult, ActionError, type ActionResult } from '@/lib/actions/result'`.
- Pure logic: `@/lib/bingo/{layout,winlines,joinCode,rank}`.
- DB types: `@/lib/supabase/database.types` (`Database`, `Tables<'x'>`, `Enums<'x'>`).

## Rules
- **Mutations** → `lib/actions/<domain>.ts`, first line `'use server'`. Each action:
  1. `const { supabase, user } = await requireUser()`.
  2. Validate input with a Zod schema from `lib/validation/<domain>.ts` (throw `ActionError('validation', msg)` or `fail('validation', ...)` on failure).
  3. Do Supabase work **as the user** (RLS applies) or call the documented RPC.
  4. `revalidatePath(...)` for affected routes.
  5. Return `ActionResult<T>` — wrap the body in `withResult(async () => { ... })` or build `ok(...)`/`fail(...)` directly.
- **Reads** → `lib/queries/<domain>.ts` (NO `'use server'`; plain async server functions using the server client). Return typed data; throw `ActionError('not_found', ...)` etc.
- **Membership writes MUST use RPCs**: `supabase.rpc('create_group', { p_name, p_description })`,
  `supabase.rpc('join_group', { p_code })`, `supabase.rpc('accept_invite', { p_token })`,
  `supabase.rpc('get_invite_preview', { p_token })`.
- **Never** write `bingos` or `notifications` from the client. **Never** insert `group_members`
  directly. **Never** use the service-role/admin client in endpoints.
- **Deferred RPCs**: operations that mutate OTHER users' rows — D5 un-marking a challenge across
  all players, structural rebuild of player cards, ownership transfer — are BLOCKED by RLS and need
  a `SECURITY DEFINER` RPC that is intentionally deferred. Implement what IS possible under RLS,
  add `// TODO(rpc): needs SECURITY DEFINER <name>`, and `return fail('error', 'Not yet implemented — requires a database function')` for the deferred part. Do not fake it.
- **Validation** (`lib/validation/<domain>.ts`, Zod, export schema + `z.infer` type): enforce
  documented rules — `gridSize ∈ {4,5,6}`, `freeSpace` only on odd grids, challenge count fits the
  grid, `points > 0`, `endsAt > startsAt`, `username` matches `^[a-z0-9_]{3,20}$`, email valid, etc.
- Storage uploads: validate content-type `image/*` and size (≤ 5 MB); path is
  `avatars/{userId}/...` or `group-images/{groupId}/...`; `upsert: true`; then store the path.
- Create ONLY the files listed for your bucket. Do NOT modify the shared foundation, `package.json`,
  or other buckets' files. Do NOT run full `tsc` (other buckets are being written concurrently) —
  just write type-correct, idiomatic code. Keep functions small and typed.
