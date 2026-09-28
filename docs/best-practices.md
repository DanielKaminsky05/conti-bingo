# Conti-Bingo — Engineering Best Practices

**Status:** Draft v0.1 · **Last updated:** 2026-09-28
**Stack:** Next.js **16.3** (App Router) · React **19.2** · Supabase (`@supabase/ssr` 0.12) · TypeScript · Tailwind v4
**Relates to:** [`requirements.md`](./requirements.md), [`data-model.md`](./data-model.md), [`test-plan.md`](./test-plan.md)

> ⚠️ **This is Next.js 16 — verify before you assume.** Several conventions changed from
> older App Router versions. When in doubt, read the guide in
> `node_modules/next/dist/docs/` for the installed version rather than relying on memory.
> The biggest change to internalize: **`middleware.ts` is gone — it's now `proxy.ts`.**

---

## 0. Next.js 16 Cheat Sheet (things that changed)
| Old mental model | Next 16 reality |
|---|---|
| `middleware.ts` | **`proxy.ts`** (one per project, `export function proxy(request)`, `config.matcher`) |
| `params` is a plain object | **`params` is a `Promise`** — `const { id } = await params` |
| Route Handlers cached by default | **Not cached**; opt in per `GET` with `export const dynamic = 'force-static'` |
| Middleware does auth | Proxy is a first pass **only**; real authz lives in Server Components / Actions / RLS |
| `revalidatePath` for everything | Also `refresh()` (router refresh) and `updateTag`/`revalidateTag` (tagged data) from `next/cache` |

---

## 1. Architecture Overview
Conti-bingo is a **Next.js frontend with Supabase as the backend**. We deliberately keep
business rules in two places, both enforced server-side:

1. **Postgres + RLS** — the source of truth for *who can touch what data*. Every table has
   Row-Level Security; the `check_bingo()` trigger owns win detection. Even a leaked key
   or a hand-crafted request can't cross group boundaries.
2. **Next.js server layer** (Server Components + Server Actions) — orchestration,
   validation, and session handling. It never trusts the client and always acts as the
   signed-in user (RLS applies).

The client (browser) is a **rendering + interaction layer only**. It never holds secrets
and never makes trust decisions.

```
Browser (Client Components)
   │  forms / taps → Server Actions;  reads via Server Components
   ▼
Next.js server (Server Components, Server Actions, Route Handlers, proxy.ts)
   │  Supabase client bound to the user's session (anon/publishable key + JWT)
   ▼
Supabase: Postgres (RLS + triggers), Auth (email/pw + email confirmation), Realtime
```

---

## 2. Server vs. Client Components

**Default to Server Components.** Only add `'use client'` when you need state, event
handlers, lifecycle, or browser APIs. Push the boundary **as deep as possible**.

- **Server Components** — pages, layouts, data fetching (query Supabase directly here),
  anything using secrets. In conti-bingo: the group page, card view shell, leaderboard
  initial render, card-history browsing.
- **Client Components** — only the interactive leaves: the tappable bingo cell, the
  live-updating leaderboard subscriber, the "first to bingo" toast, auth forms.

**Rules of thumb**
- Keep `'use client'` on the smallest possible component. A mostly-static page with one
  interactive widget stays a Server Component that imports the widget.
- Pass server-fetched data **down as props** (must be serializable), or stream with `use()`.
- Need context (theme, current group)? Put the provider in a small Client Component and
  render it as deep in the tree as possible.
- **Prevent environment poisoning**: never import server-only modules into client code.
  Put `import 'server-only'` at the top of any module that touches secrets or the
  service-role key. Only `NEXT_PUBLIC_`-prefixed env vars reach the browser.

---

## 3. Building "APIs": Server Actions vs. Route Handlers

Prefer **Server Actions** (Server Functions) for first-party mutations from our own UI.
Use **Route Handlers** for public HTTP endpoints, webhooks, or non-UI responses.

### 3.1 Server Actions (the default for mutations)
Use for: create group, join by code, author/replace card, mark a cell.

```ts
// app/lib/actions/cards.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const MarkCell = z.object({
  playerCardId: z.string().uuid(),
  position: z.number().int().min(0),
  marked: z.boolean(),
})

export async function markCell(input: unknown) {
  // 1. AUTHENTICATE — every action is reachable by direct POST, so never skip this
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // 2. VALIDATE input at the boundary
  const { playerCardId, position, marked } = MarkCell.parse(input)

  // 3. MUTATE as the user — RLS enforces they own this player_card
  const { error } = await supabase
    .from('player_card_cells')
    .update({ is_marked: marked, marked_at: marked ? new Date().toISOString() : null })
    .eq('player_card_id', playerCardId)
    .eq('position', position)
  if (error) throw error

  // 4. REVALIDATE the affected view
  revalidatePath(`/cards/${playerCardId}`)
}
```

**Non-negotiables for every Server Action**
1. **Authenticate** with `supabase.auth.getUser()` (validates the JWT) — *not*
   `getSession()`, which only reads the cookie.
2. **Authorize** — rely on RLS as the backstop, but also check role where the UI implies
   it (e.g., only a host authors cards). Defense in depth.
3. **Validate** input with a schema (Zod). Actions receive arbitrary payloads.
4. Return **serializable** data or `revalidatePath` / `refresh()` to update the UI.
5. Keep them in `'use server'` files under `app/lib/actions/…`, one domain per file.

### 3.2 Route Handlers (`route.ts`)
Use for: Supabase **auth callback** (`app/auth/callback/route.ts`), health checks, and any
future public/webhook endpoint. Remember they are **public** and **uncached by default**.

- Validate content-type and body size; never trust input.
- Use `try/catch`; return generic error messages (no stack traces / internal details).
- Type params via the Promise: `async function GET(_req, ctx: RouteContext<'/x/[id]'>) { const { id } = await ctx.params }`.
- Don't call your own Route Handlers from Server Components — query the data source
  directly (avoids an extra HTTP round trip and build-time failures).

### 3.3 Don't fetch via your own API from the server
In Server Components, query Supabase directly. Route Handlers-as-data-source is slower
(extra hop) and breaks static prerender.

---

## 4. Supabase Client Setup (`@supabase/ssr`)

Use **three** clients — never share one across environments, and **never** put the
service-role key in anything the browser can import.

```
lib/supabase/
  client.ts   // browser: createBrowserClient (publishable/anon key) — Client Components
  server.ts   // server:  createServerClient bound to request cookies — Server Comp/Actions
  admin.ts    // server-only: service-role key — import 'server-only'; use RARELY
```

- **Browser client** — publishable (anon) key only. Safe to ship; RLS protects data.
- **Server client** — reads/writes the session cookie so requests run **as the user**;
  this is what makes RLS apply. Use in Server Components and Server Actions.
- **Admin client** — service-role key **bypasses RLS**. `import 'server-only'` at the top.
  Use only for genuine admin tasks (never in a request path a user controls). Prefer not
  to need it at all.

**Session refresh lives in `proxy.ts`** (the file formerly known as middleware):

```ts
// proxy.ts  (project root — NOT middleware.ts)
import { updateSession } from '@/lib/supabase/proxy'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export async function proxy(request) {
  return updateSession(request) // refreshes the Supabase auth cookie
}
```

> The proxy refreshes tokens and can gate obvious cases, but it is **not** our auth
> boundary. Real checks happen in Server Components/Actions (`getUser()`) and in RLS.

---

## 5. Auth & Role Control

### 5.1 Authentication
- Email + password with **email confirmation on sign-up** (no 2FA), all handled by Supabase
  Auth. We build the sign-up / sign-in screens and the `/auth/callback` confirmation
  handler; Supabase manages hashing, the confirmation email, and verification. (D3)
- Gate on **confirmed** accounts where it matters (an unconfirmed user shouldn't play).
- Always identify the user with `supabase.auth.getUser()` server-side. Treat
  `getSession()` as untrusted (cookie-only).

### 5.2 Authorization — per-group roles
Roles live on **`group_members.role`** (`owner` / `admin` / `member`), not on the JWT (D7):
- **owner** — one per group (partial unique); full control incl. delete/archive, role
  management, ownership transfer. `groups.host_id` points at the current owner.
- **admin** (co-host) — author/publish cards, invite, manage roster + join code, edit group.
- **member** — play only.
- "Host" = **owner or admin**, expressed in SQL as an `EXISTS` on `group_members` with
  `role IN ('owner','admin')`.

Enforce this in **three layers**:
1. **RLS (primary)** — host-only writes on `cards`/`challenges`/`invites`; owner-only for
   role changes + delete; owner-only single-owner guarantee; owner-only for player_cards is
   actually **owner-of-the-row** (the player). Member-only reads on group data;
   recipient-only on `notifications`. See `data-model.md` §9.
2. **Server Actions** — re-check the role before mutating so we can return a clean error
   instead of a silent RLS `0 rows`.
3. **UI** — hide host-only controls from members (convenience, **not** security).

### 5.3 Authorization traps to avoid (Supabase)
- **Never** base authz on `user_metadata` / `raw_user_meta_data` — it's user-editable.
  Use `app_metadata` or, better here, the relational checks above.
- **`TO authenticated` alone is not authorization** — always pair it with an ownership
  predicate (`auth.uid() = user_id` or a membership `EXISTS`), or you have an IDOR/BOLA.
- **UPDATE policies need both `USING` and `WITH CHECK`** — otherwise a user can reassign a
  row's `user_id`.
- **Deleting a user doesn't revoke their tokens** — sign out / revoke sessions for
  sensitive changes.

---

## 6. Data Access & Validation
- **Validate at every server boundary** (Zod schemas for Server Action inputs and Route
  Handler bodies). Never pass raw client input to the database or another system.
- **Let RLS be the wall, not the app.** App-level role checks improve UX and error
  messages; RLS is what actually protects data.
- **Win detection stays in the DB.** The client marks cells; the trigger decides bingos.
  The client must never write to `bingos`.
- **Realtime**: subscribe in Client Components to the group's `bingos` (insert = alert,
  delete = revoke) and the user's `notifications` (and optionally `player_card_cells`) for
  live leaderboard, alerts, and the notification badge. RLS filters what each client
  receives — don't rely on the client to filter.
- **Notifications & bingos are server-written only** — clients read/subscribe and mark their
  own notifications read; they never insert `bingos` or `notifications`.
- **Storage (avatars, group images)** — upload via a Server Action (validate content-type +
  size); store only the object **path** in the DB; bucket RLS restricts writes to the owner's
  / group's folder (upsert needs INSERT+SELECT+UPDATE). Never trust client-supplied paths.
- **Prefer server-side reads** for initial render (Server Components); use client-side
  subscriptions only for the live-updating pieces.

---

## 7. Project Structure (proposed)
```
app/
  (auth)/                # sign-in, sign-up, confirm-email screens (route group)
  auth/callback/route.ts # Supabase OAuth/email callback (Route Handler)
  (app)/
    groups/[id]/page.tsx        # Server Component: group dashboard
    cards/[id]/page.tsx         # Server Component: card view shell
    cards/[id]/bingo-grid.tsx   # 'use client': interactive grid
    leaderboard.tsx             # 'use client': realtime subscriber
  lib/
    actions/               # 'use server' modules: groups, cards, play, invites,
                           #   notifications, profile, members (roles)
    supabase/              # client.ts, server.ts, admin.ts, proxy.ts, storage.ts
    bingo/                 # PURE logic: layout shuffle, win-line math (unit-tested)
    validation/            # Zod schemas shared by actions/handlers
proxy.ts                   # session refresh (root)
supabase/
  migrations/              # SQL migrations (generated, reviewed, committed)
  # Storage buckets: avatars, group-images (with RLS policies)
docs/                      # these planning docs
```
- **Pure, testable logic** (shuffle, win-line geometry, join-code, ranking) lives in
  `lib/bingo/` with **no** React/Supabase imports, so it's trivially unit-testable
  (see `test-plan.md` §3).
- Co-locate a component's Client leaves next to its Server page.

---

## 8. Security Checklist (run before every PR touching data/auth)
- [ ] Every Server Action calls `getUser()` and validates input.
- [ ] No `service_role` key reachable from client code; secrets behind `server-only`.
- [ ] Only `NEXT_PUBLIC_` env vars are used in Client Components.
- [ ] RLS enabled on every new `public` table, with ownership/membership predicates
      (not role-only), and `WITH CHECK` on updates.
- [ ] No authz decision reads `user_metadata`.
- [ ] Views (e.g. leaderboard) use `security_invoker = true`.
- [ ] `SECURITY DEFINER` functions avoided unless justified; if used, non-exposed schema +
      internal `auth.uid()` check.
- [ ] Ran `get_advisors` (security + performance) after schema changes; no new warnings.
- [ ] Route Handlers: input validated, generic error messages, no sensitive data leaked.
- [ ] Open-redirect guard on any callback that reads a redirect URL (same-origin only).
- [ ] Storage buckets: write policies restrict to the owner's/group's folder; uploads
      validate content-type + size; DB stores the path, not client-trusted URLs.
- [ ] `notifications`/`bingos` have **no** client insert path (server/trigger only);
      `notifications` readable only by their recipient.

---

## 9. Coding Conventions
- **TypeScript strict**; generate DB types with Supabase (`generate_typescript_types`) and
  use them across the server layer.
- **Async params**: always `await params` / `await searchParams`.
- **Errors**: throw in Server Actions for exceptional cases; return typed result objects
  for expected validation failures so the UI can render them.
- **Pending/optimistic UI**: use `useActionState` / `useTransition` for marking cells so
  taps feel instant (mobile-first requirement).
- **Migrations**: iterate on schema with `execute_sql`, then generate a reviewed migration
  and commit it — never hand-invent migration filenames (see the Supabase skill).
- **Keep the agent block**: the `next dev`-generated block in `AGENTS.md` is re-added by
  the dev server; commit it with your work to keep the tree clean.

---

## 10. Resolved Decisions (see [`decisions.md`](./decisions.md))
- **Leaderboard** — a `security_invoker` **view**. **(D1)**
- **Data API exposure** — grant **`SELECT` only** to `authenticated` (RLS-guarded) on the
  read/Realtime tables; **all writes via Server Actions**; `bingos` written only by the
  trigger. **(D2)**
- **Auth** — email + password with **email confirmation; no 2FA**. **(D3)**
- **Revocable wins** — the trigger inserts on completion and **deletes on unmark**. **(D4)**
- **Card editing anytime** — per-square edits un-mark only that square (trigger revokes
  dependent bingos); grid/layout changes rebuild player cards. **(D5)**
- **Free space only on 5×5** (odd grids). **(D6)**
- **Realistic-app enrichment** — per-group roles/co-hosts, invitations, notifications,
  profile/avatars + group images (Storage), card drafts/scheduling/weighted points, universal
  timestamps + indexes. Activity feed + reactions deferred. **(D7)**
