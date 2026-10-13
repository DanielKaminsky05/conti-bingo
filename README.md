# Conti-Bingo

A real-time, mobile-first web app for playing **"conti-bingo"** — a classroom participation
game where students self-mark cheeky challenges ("thank the prof for picking me") on a bingo
card while contributing in class. A section's **VP Academics** authors a card, creates a
group, and invites classmates; players track their own card and compete on a live leaderboard
with real-time "first to bingo" alerts.

Built for Ivey Business School sections (~70–80 players per group). Unofficial and student-run.

## Features

- **Two game modes** — *individual* (everyone gets their own shuffled card) and *co-op* (one
  shared board any member can mark, filled by blackout).
- **Live multiplayer** — leaderboards and "first to bingo" alerts stream over Supabase
  Realtime; wins are **revocable** (unmarking a square retracts the bingo in real time).
- **Card authoring** — 4×4 / 5×5 / 6×6 grids, optional free space, per-square text or images,
  weighted points, drafts, and scheduled game windows.
- **Groups & roles** — owner / admin / member access control, email invites, and
  notifications.
- **Installable PWA** — service worker + manifest; responsive and mobile-first, runs on phone,
  tablet, and desktop and installs to the home screen.

## Architecture

Business rules are enforced **server-side in two layers**; the browser is a rendering +
interaction layer only and never makes a trust decision.

1. **Postgres + Row-Level Security** — the source of truth for who can touch what. Every
   `public` table has RLS with real ownership/membership predicates, and database triggers own
   win detection and revocation. **62 RLS policies** and **11 triggers** across **12 tables**.
2. **Next.js server layer** — Server Components for reads and Server Actions for mutations,
   handling validation, session handling, and orchestration — always acting as the signed-in
   user so RLS applies. No client-side inserts/updates/deletes.

```
Browser (Client Components) ──forms/taps→ Server Actions;  reads via Server Components
   ▼
Next.js server (Server Components, Server Actions, Route Handlers, proxy.ts)
   ▼  Supabase client bound to the user's session (publishable key + JWT)
Supabase: Postgres (RLS + triggers) · Auth · Realtime · Storage
```

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict) · **Tailwind v4**
- **shadcn/ui** (Base UI variant) · `lucide-react` · `sonner` · `next-themes`
- **Supabase** — Postgres 17 (RLS + triggers), Auth (email/password + confirmation),
  Realtime, Storage
- **Zod** for validation · **Vitest** for tests

## Project layout

```
app/        App Router routes — auth, authenticated shell, group pages, invites
components/ UI primitives + feature components (bingo, cards, members, …)
lib/
  actions/    'use server' mutations (one domain per file)
  queries/    server-side reads
  bingo/      pure logic (layout, win lines, join codes, ranking)
  validation/ Zod schemas per domain
  supabase/   browser / server / admin clients, generated types
  realtime/   Realtime subscriptions
supabase/migrations/   SQL migrations (schema is the source of truth)
test/       unit (pure logic + Zod) · integration (RLS behavior as real users)
docs/       product + technical specs
```

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project values
npm run dev            # http://localhost:3000
```

Required environment variables (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (integration tests only — never commit the real value)

## Commands

```bash
npm run dev         # next dev
npm run build       # next build
npm run lint        # eslint
npm run typecheck   # next typegen && tsc --noEmit
npm run test        # vitest run (all)
npm run test:unit   # pure logic + validation (no DB)
npm run test:int    # integration (needs Supabase + service role key)
```

## Testing

- **Unit** — pure logic (`lib/bingo/*`) and Zod schemas; no network.
- **Integration** — real database behavior exercised *as real users* through the Supabase
  client so RLS applies: unauthenticated requests rejected, wrong-role blocked, IDOR/BOLA,
  validation failures, and idempotency (join, card creation, mark → bingo).

CI (GitHub Actions) runs typecheck + unit tests on every push, and integration tests against
an ephemeral local Supabase stack.
