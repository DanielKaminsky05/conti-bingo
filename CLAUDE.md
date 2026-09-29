@AGENTS.md

# Conti-Bingo

A mobile-first web app for Ivey Business School sections to play "conti-bingo" — a
participation game where students self-mark cheeky challenges ("thank the prof for picking
me") on a bingo card while contributing in class. A section's **VP Academics** authors a
card, creates a group, and invites the section; players track their own card and compete via
a live leaderboard and real-time "first to bingo" alerts. Unofficial, student-run, ~70–80
players per group.

## ⚠️ This is Next.js 16 — not what you remember

`@AGENTS.md` (above) is the `next dev`-generated block; **keep it committed**. The App Router
changed materially from older versions. Before writing framework code, read the guide in
`node_modules/next/dist/docs/`. Key gotchas:

- **`middleware.ts` is gone → it's `proxy.ts`** (project root, `export function proxy(request)`, `config.matcher`). Ours refreshes the Supabase session.
- **`params` / `searchParams` are Promises** — always `await` them.
- Route Handlers are **not cached** by default (opt in per `GET` with `export const dynamic = 'force-static'`).
- The proxy is a first pass only — real authz lives in Server Components / Server Actions / RLS.

## Stack

- **Next.js 16.3** (App Router) · **React 19.2** · **TypeScript strict** · **Tailwind v4**
- **shadcn/ui (Base UI variant)** for primitives · `lucide-react` · `sonner` toasts · `next-themes` (dark mode)
- **Supabase** backend: Postgres 17 (RLS + triggers), Auth (email/password + email confirmation, no 2FA), Realtime, Storage. `@supabase/ssr` 0.12.
- **Zod v4** for input validation · **Vitest** for tests

## Commands

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npm run typecheck    # next typegen && tsc --noEmit
npm run test         # vitest run (all)
npm run test:unit    # vitest run test/unit  (pure logic + validation; no DB)
npm run test:int     # vitest run test/integration  (needs Supabase + service role key)
```

## Architecture

Business rules are enforced **server-side in two layers**; the browser is a rendering +
interaction layer only and never holds secrets or makes trust decisions.

1. **Postgres + RLS** — source of truth for *who can touch what*. Every `public` table has
   Row-Level Security with real ownership/membership predicates. The `check_bingo()` trigger
   owns win detection. Win logic and cross-user mutations live in the DB, not the app.
2. **Next.js server layer** — Server Components (reads) + Server Actions (mutations) for
   validation, session handling, orchestration. Always acts as the signed-in user (RLS applies).

```
Browser (Client Components) ──forms/taps→ Server Actions;  reads via Server Components
   ▼
Next.js server (Server Components, Server Actions, Route Handlers, proxy.ts)
   ▼  Supabase client bound to the user's session (publishable/anon key + JWT)
Supabase: Postgres (RLS + triggers) · Auth · Realtime · Storage
```

### Reads vs. writes vs. realtime (D1/D2)

- **Reads**: Server Components call `lib/queries/*` directly (typed server-client queries). Clients also get `SELECT`-only grants on read tables so Realtime works.
- **Mutations**: exclusively Server Actions in `lib/actions/*` (`'use server'`). **No client-side inserts/updates/deletes.**
- **Realtime**: clients subscribe to `bingos` (insert = alert, delete = revoke) and their own `notifications` (badge). RLS filters delivery.
- **`bingos` and `notifications` are server/trigger-written only** — never insert them from the client. **Never insert `group_members` directly** (use membership RPCs). **Never use the admin/service-role client in a request path.**

## Project layout

```
app/
  (auth)/            login, signup, confirm-email  (public route group)
  (app)/             authenticated shell (header + role-gated nav)
    page.tsx           dashboard (my groups)
    profile/ notifications/ join/[code]/
    groups/[id]/       layout.tsx (group shell — do NOT recreate) + page (Play hub),
                       leaderboard/ members/ settings/ cards/ cards/new/ cards/[cardId]/
  invite/[token]/    accept an emailed invite (public preview)
  auth/callback/route.ts   email-confirmation handler (A6)
  api/health/route.ts      liveness (O1)
components/          ui/ (shadcn primitives) · app/ bingo/ cards/ members/ profile/
                     settings/ notifications/ common/ (submit-button, empty-state, view-toggle)
lib/
  actions/           'use server' mutations, one domain per file (+ result.ts helpers)
  queries/           plain async server reads (NO 'use server')
  bingo/             PURE logic (no React/Supabase): layout, winlines, joinCode, rank
  validation/        Zod schemas per domain (export schema + z.infer type)
  supabase/          client.ts (browser) · server.ts (per-request) · admin.ts (service-role, server-only) · proxy.ts · database.types.ts
  realtime/          subscriptions.ts (bingos, player cells) · notifications.ts
  auth/              session.ts (requireUser) · current-user.ts
  storage-url.ts     publicStorageUrl(bucket, path) · utils.ts (cn)
proxy.ts             session refresh (root — the file formerly known as middleware.ts)
supabase/migrations/ 01–10 SQL migrations (schema APPLIED to the live project)
test/                unit/ · integration/ (*.int.test.ts) · helpers/supabase.ts · setup.ts
docs/                planning docs — the authoritative spec (see below)
```

## Endpoint conventions (reuse the shared foundation — do NOT reimplement it)

- Auth: `const { supabase, user } = await requireUser()` (from `@/lib/auth/session`; validates JWT via `getUser()`, never `getSession()`).
- Server client: `import { createClient } from '@/lib/supabase/server'` (typed with `Database`).
- **Actions** (`lib/actions/<domain>.ts`, `'use server'`): (1) `requireUser()`, (2) validate with a Zod schema from `lib/validation/<domain>.ts`, (3) mutate as the user (RLS) or call the documented RPC, (4) `revalidatePath(...)`, (5) return `ActionResult<T>`.
- **Result convention** (`@/lib/actions/result`): actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; code; error }` for *expected* outcomes (validation/authz failures) so the UI can render them — they do **not** throw for those and do **not** redirect. Reserve `throw ActionError(code, msg)` for internal errors; wrap bodies in `withResult(async () => …)`. Codes: `unauthorized | forbidden | not_found | validation | conflict | error`.
- **Queries** (`lib/queries/<domain>.ts`): plain async server functions, no `'use server'`. They **throw** on failure (`ActionError('not_found', …)`) — wrap page sections in try/catch or let error/`not-found` boundaries handle it.
- **Membership writes MUST use SECURITY DEFINER RPCs**: `rpc('create_group')`, `rpc('join_group')`, `rpc('accept_invite')`, `rpc('get_invite_preview')`, `rpc('transfer_ownership')`. Cross-user mutations (D5 per-square reset, structural rebuild, publish) go through the migration-08 RPCs: `publish_card`, `rebuild_player_cards`, `reset_edited_challenge`, `recount_card`.
- Validation rules to enforce: `gridSize ∈ {4,5,6}`, `freeSpace` only on odd grids (5×5), challenge count fits the grid, `points > 0`, `endsAt > startsAt`, `username` matches `^[a-z0-9_]{3,20}$`.
- Storage: validate content-type `image/*` + size (≤ 5 MB); paths `avatars/{userId}/…` / `group-images/{groupId}/…`; `upsert: true`; store only the path in the DB.

## Frontend conventions

- **Server Components by default**; add `'use client'` only for interactive leaves (grid cells, leaderboard subscriber, toasts, forms, dialogs). Push the boundary as deep as possible. `import 'server-only'` in any module touching secrets. Only `NEXT_PUBLIC_` env vars reach the browser.
- **Base UI composes via a `render` prop, NOT `asChild`**: `<Button render={<Link href="…" />}>` or style a `Link` with `buttonVariants({ variant, size })`.
- Call actions from client components via `useTransition`; show feedback with `sonner`'s `toast` and `<SubmitButton pending>`. After a mutation that changes server-rendered data, call `router.refresh()`.
- Shared helpers: `@/lib/queries/membership` → `getMyRole(groupId)`, `isHost(role)`; `@/lib/auth/current-user` → `getCurrentUser()`, `getCurrentProfile()`; `@/components/common/{submit-button,empty-state}`.
- The group shell `app/(app)/groups/[id]/layout.tsx` already exists (header + role-gated nav) — pages render inside it; don't recreate it.
- **Aesthetic**: Wordle-inspired — soft, rounded, mobile-first. Theme tokens in `globals.css`: `bg-background`/`bg-card`/`bg-primary` (green) plus bespoke tiles `bg-marked`, `bg-free`, `text-gold`, `border-tile-border`. Tiles are `aspect-square rounded-xl`, ≥44px. Support dark mode; respect `prefers-reduced-motion`.

## Data model (schema is APPLIED — migrations 01–10)

Supabase project `conti-bingo` (`oklzgorvsiyrlulsowij`, Postgres 17). Types generated at
`lib/supabase/database.types.ts` (`Database`, `Tables<'x'>`, `Enums<'x'>`).

```
auth.users → profiles (username, name, avatar_path)
  └ groups (host_id, join_code, join_locked, status)
      ├ group_members (role: owner|admin|member; one owner per group via partial unique)
      ├ invites (email/token, role, expiry, status)
      └ cards (draft → one active → archived; grid_size 4/5/6, layout_mode, free_space, win_condition, game_mode individual|coop, schedule)
          ├ challenges (text nullable, image_path nullable [≥1 of the two required], points, sort_index)
          ├ player_cards (INDIVIDUAL mode; shuffle_seed; denormalized marks_count/points_total/bingo_count)
          │   ├ player_card_cells (position, challenge_id nullable=free, is_marked)
          │   └ bingos (line|blackout, line_key; REVOCABLE)
          └ coop_boards (COOP mode; ONE shared board per card; completed_at REVOCABLE)
              └ coop_board_cells (position, challenge_id nullable=free, is_marked, marked_by = contributor)
  └ notifications (recipient)
Storage: avatars/{user_id}/… · group-images/{group_id}/…  (RLS-guarded)
```

- **Win detection is a DB trigger** (`check_bingo` on `player_card_cells`). Wins are **revocable** (D4): marking inserts newly-completed lines into `bingos` (idempotent via `UNIQUE(player_card_id, line_key)`); unmarking deletes bingos no longer satisfied. Insert = "first to bingo" alert; delete = revoke.
- **Leaderboard** is a `security_invoker` **view** (D1), ranked by bingos desc → weighted points desc → squares desc → earliest `first_bingo_at`. It reads denormalized counters on `player_cards` so standings respect RLS without exposing other players' individual cells.
- RLS helpers `is_group_member/admin/owner` live in a non-exposed `private` schema. "Host" = `role IN ('owner','admin')`.
- After any schema/policy change run `get_advisors` (security + performance) and keep it clean.

## Testing

- **Unit** (`test/unit/*.test.ts`): pure logic (`@/lib/bingo/*`) + Zod schemas. No network. Must pass now.
- **Integration** (`test/integration/*.int.test.ts`): real DB behavior AS real users via `@/test/helpers/supabase` (`createTestUser` → signed-in client so RLS applies, `admin`, `anonClient`, `deleteTestUsers`, `hasServiceRole`). Wrap suites in `describe.skipIf(!hasServiceRole)(...)`. Do NOT import Server Action functions (they need a Next request context) — replicate their Supabase calls as the authed user. Create your own users/groups per test; clean up in `afterAll`.
- Cover the negatives that matter: unauthenticated rejected, wrong role blocked, IDOR/BOLA (wrong owner/group), validation failures, idempotency (join, `getOrCreatePlayerCard`, mark→bingo).
- **CI** (`.github/workflows/ci.yml`): typecheck + unit tests always (no DB); integration against an ephemeral local Supabase (`supabase start` applies migrations, injects `SERVICE_ROLE_KEY`).

## Environment

`.env` (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
and `SUPABASE_SERVICE_ROLE_KEY` (integration tests only — never commit the real value).

## Key decisions (`docs/decisions.md`)

- **D1** Leaderboard = `security_invoker` view. **D2** Reads via Data API (RLS) + Realtime; writes only via Server Actions. **D3** Email + password with email confirmation, **no 2FA**. **D4** Bingos are **revocable** (trigger inserts and deletes). **D5** Cards editable anytime — a single challenge-text edit un-completes only that square across players (trigger revokes dependent bingos); grid/layout changes rebuild player cards. **D6** Free space only on odd grids (5×5). **D7** Enriched model — roles/co-hosts, invites, notifications, drafts/scheduling/weighted points, avatars/group images. Activity feed + reactions deferred. **D8** Per-square images (nullable `challenges.text`/`image_path`) + **group co-op mode** (`cards.game_mode`): one shared `coop_boards`/`coop_board_cells` board filled by blackout, `marked_by` = griefing-lock + contributions leaderboard; kept separate from the individual-play tables.

## Documentation map (`docs/` — the authoritative spec)

| Doc | Contents |
|---|---|
| `requirements.md` | Product spec, roles (owner/admin/member), user stories, functional reqs |
| `data-model.md` | Full schema, enums, RLS intent, triggers, indexes, storage |
| `api-endpoints.md` | Every endpoint (Action/Query/Route/RPC/Realtime/Storage) + test cases |
| `best-practices.md` | Next.js 16 cheat sheet, server/client split, Supabase client setup, auth/RLS, security checklist |
| `impl-conventions.md` | How to implement endpoints (shared foundation, result/validation rules) |
| `frontend-conventions.md` | Component APIs (Base UI), action/query signatures, realtime helpers |
| `frontend-plan.md` | Route map, per-page spec, reusable components, design system |
| `test-conventions.md` / `test-plan.md` | How/what to test across unit/integration/e2e |
| `decisions.md` | Decision log D1–D8 with rationale |
