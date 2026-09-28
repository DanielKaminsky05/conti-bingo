# Conti-Bingo — Data Model

**Status:** Draft v0.3 (design only — not yet applied to the database) · **Last updated:** 2026-09-28
**Supabase project:** `conti-bingo` (`oklzgorvsiyrlulsowij`, Postgres 17)

> Authentication (email + password, with **email confirmation** on sign-up; no 2FA) is
> handled natively by Supabase Auth in the `auth` schema. Our application tables live in
> `public` and reference `auth.users` for identity. Every `public` table has **RLS enabled**
> with real ownership/membership predicates. Binary media (avatars, group images) live in
> **Supabase Storage**; the DB stores only the object path. See [`decisions.md`](./decisions.md).

## 1. Entity Overview

```
auth.users (Supabase Auth — email + password, email-confirmed; no 2FA)
    │
    └─ profiles (1:1)              username, display name, avatar
            │
            ├─ groups (host_id)                    a section's space (+ image, description)
            │     │
            │     ├─ group_members (role)          owner / admin (co-host) / member
            │     ├─ invites                        email/token invitations
            │     └─ cards                          draft → active (one) → archived
            │           ├─ challenges               square prompts (+ points)
            │           └─ player_cards             each player's instance (+ seed)
            │                 ├─ player_card_cells  arrangement + marks
            │                 └─ bingos             wins (line/blackout), revocable
            │
            └─ notifications (recipient = user)     in-app notification center

Storage buckets: avatars/{user_id}/…, group-images/{group_id}/…  (RLS-guarded)
```

## 2. Enums
```sql
create type card_layout_mode   as enum ('shuffled', 'identical');
create type card_win_condition as enum ('line', 'blackout');
create type card_status        as enum ('draft', 'active', 'archived');
create type group_status       as enum ('active', 'archived');
create type bingo_type         as enum ('line', 'blackout');
create type member_role        as enum ('owner', 'admin', 'member');   -- admin = co-host
create type invite_status      as enum ('pending', 'accepted', 'revoked', 'expired');
create type notification_type  as enum (
  'member_joined', 'invite_received', 'card_published', 'card_replaced',
  'bingo_achieved', 'out_bingoed'
);
```

## 3. Tables

### `profiles`
One row per user, mirrors `auth.users.id`.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` (FK, on delete cascade) |
| `username` | text not null UNIQUE (case-insensitive) | handle; unique via `lower(username)` index |
| `name` | text not null | display name |
| `avatar_path` | text | **optional** — object path in the `avatars` Storage bucket; `null` = default |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()`; maintained by `set_updated_at` trigger |

### `groups`
A section's space.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` | text not null | e.g. "Section 5" |
| `description` | text | optional |
| `image_path` | text | optional — object path in `group-images` bucket |
| `host_id` | uuid not null FK→profiles | canonical **owner** (also the `owner` member row) |
| `join_code` | text not null UNIQUE | short shareable code |
| `join_locked` | bool not null default false | when true, new joins via code are disabled |
| `status` | `group_status` not null default `active` | `active` \| `archived` |
| `created_at` / `updated_at` | timestamptz | timestamps |

### `group_members`
Membership + role. The host is a member with role `owner`; co-hosts are `admin`.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid not null FK→groups | on delete cascade |
| `user_id` | uuid not null FK→profiles | on delete cascade |
| `role` | `member_role` not null default `member` | `owner` \| `admin` \| `member` |
| `nickname` | text | optional per-group display override |
| `joined_at` | timestamptz | default `now()` |
| | | UNIQUE(`group_id`, `user_id`) |
| | | **partial UNIQUE(`group_id`) WHERE role='owner'** → exactly one owner |

### `invites`
Email/token invitations (complements the join code).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid not null FK→groups | on delete cascade |
| `email` | text | invitee email (nullable for a pure share-link invite) |
| `token` | text not null UNIQUE | secret token embedded in the invite link |
| `role` | `member_role` not null default `member` | role granted on accept (`member`/`admin`) |
| `status` | `invite_status` not null default `pending` | `pending`/`accepted`/`revoked`/`expired` |
| `invited_by` | uuid not null FK→profiles | who sent it |
| `accepted_by` | uuid FK→profiles | set on accept |
| `expires_at` | timestamptz | invite expiry |
| `accepted_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | timestamps |

### `cards`
Draft → one active → archived history.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `group_id` | uuid not null FK→groups | on delete cascade |
| `title` | text not null | |
| `description` | text | optional instructions |
| `grid_size` | int not null default 5 | CHECK in (4, 5, 6) |
| `layout_mode` | `card_layout_mode` not null | `shuffled` \| `identical` |
| `free_space` | bool not null default true | CHECK (`free_space=false OR grid_size % 2 = 1`) — odd grids only (D6) |
| `win_condition` | `card_win_condition` not null default `line` | `line` \| `blackout` |
| `status` | `card_status` not null default `draft` | `draft` → `active` → `archived` |
| `starts_at` | timestamptz | optional scheduling |
| `ends_at` | timestamptz | optional; CHECK (`ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at`) |
| `created_by` | uuid FK→profiles | |
| `created_at` / `updated_at` | timestamptz | timestamps |

**One active card per group** (drafts/archived unrestricted):
```sql
create unique index one_active_card_per_group
  on cards (group_id) where (status = 'active');
```

### `challenges`
The prompt pool for a card, with optional weighting.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `card_id` | uuid not null FK→cards | on delete cascade |
| `text` | text not null | "call the professor handsome" |
| `points` | int not null default 1 | CHECK (`points > 0`) — weighted scoring |
| `sort_index` | int not null | authoring order; fixed position in `identical` mode |
| `created_at` / `updated_at` | timestamptz | timestamps |
| | | UNIQUE(`card_id`, `sort_index`) |

### `player_cards`
A player's instance of a card.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `card_id` | uuid not null FK→cards | on delete cascade |
| `user_id` | uuid not null FK→profiles | on delete cascade |
| `shuffle_seed` | bigint | seed used to build a `shuffled` layout (null for `identical`) — reproducibility |
| `first_bingo_at` | timestamptz | when this player first hit any bingo |
| `completed_at` | timestamptz | when the card was fully marked (blackout) |
| `created_at` / `updated_at` | timestamptz | timestamps |
| | | UNIQUE(`card_id`, `user_id`) |

### `player_card_cells`
Per-player arrangement + mark state (handles both layout modes).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `player_card_id` | uuid not null FK→player_cards | on delete cascade |
| `position` | int not null | 0 … (grid_size² − 1) |
| `challenge_id` | uuid FK→challenges | nullable; `null` = free space |
| `is_marked` | bool not null default false | free space initialized `true` |
| `marked_at` | timestamptz | nullable |
| | | UNIQUE(`player_card_id`, `position`) |

### `bingos`
Recorded wins — drives alerts + leaderboard. **Revocable** (D4).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `player_card_id` | uuid not null FK→player_cards | on delete cascade |
| `card_id` | uuid not null FK→cards | denormalized for group queries |
| `user_id` | uuid not null FK→profiles | |
| `type` | `bingo_type` not null | `line` \| `blackout` |
| `line_key` | text | nullable; e.g. `row-2`, `col-0`, `diag-1` |
| `achieved_at` | timestamptz | default `now()`; ordering for "first to bingo" |
| | | UNIQUE(`player_card_id`, `line_key`) |

### `notifications`
In-app notification center (persisted beyond the ephemeral realtime toast).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null FK→profiles | recipient |
| `group_id` | uuid FK→groups | optional context; on delete cascade |
| `type` | `notification_type` not null | see enum |
| `payload` | jsonb not null default `'{}'` | actor, card_id, bingo_id, etc. (denormalized for display) |
| `read_at` | timestamptz | null = unread |
| `created_at` | timestamptz | default `now()` |

## 4. Derived: Leaderboard
Not stored — computed live, exposed as a `security_invoker` **view** (D1) so it respects RLS.
Per player for a card:
- **Squares completed** = count of marked cells.
- **Points** = sum of `challenges.points` for marked cells (weighted scoring).
- **Bingos** = count of `bingos` rows.
- **Rank** by bingos desc → points desc → squares desc → earliest `first_bingo_at`.

## 5. Win Detection — Database Trigger
Win logic lives in the **database**. Wins are **revocable** (D4):
- Trigger on `player_card_cells` (AFTER UPDATE OF `is_marked`) calls `check_bingo(player_card_id)`.
- On **mark**: evaluate rows/cols/diagonals (and blackout) and **insert** newly completed
  lines into `bingos` (idempotent via `UNIQUE(player_card_id, line_key)`); set
  `player_cards.first_bingo_at` / `completed_at` as applicable.
- On **unmark**: **delete** any `bingos` whose line/blackout is no longer satisfied, and
  clear `first_bingo_at`/`completed_at` if they no longer hold.
- Insert fires the "first to bingo" alert; delete propagates a revoke.

## 6. Triggers & Functions (summary)
- `set_updated_at()` — BEFORE UPDATE trigger on every table with `updated_at`.
- `check_bingo()` — win detection (above).
- `handle_new_user()` — on `auth.users` insert, create the `profiles` row (username seeded
  from email, editable later).
- `notify_*` — write `notifications` rows on key events (member joined, bingo achieved /
  out-bingoed, card published/replaced, invite received). May be trigger- or Server-Action-
  driven; **clients never insert notifications**, only mark their own as read.

## 7. Realtime
- Enable Realtime on **`bingos`** (insert = alert, delete = revoke) and **`notifications`**
  (recipient's live badge/center). Optionally on **`player_card_cells`** for live
  leaderboard deltas. RLS filters what each client receives.

## 8. Storage (Supabase Storage + RLS)
- **`avatars`** bucket — path `avatars/{user_id}/…`. A user may write **only their own**
  folder (INSERT+SELECT+UPDATE for upsert; DELETE own). Read: authenticated.
- **`group-images`** bucket — path `group-images/{group_id}/…`. Write by the group's
  `owner`/`admin`; read by group members.
- The DB stores only the object **path** (`profiles.avatar_path`, `groups.image_path`);
  the app resolves it to a URL (signed or public per bucket policy).

## 9. RLS Policy Intent (written as SQL when we apply)
| table | select | insert / update / delete |
|---|---|---|
| `profiles` | self; members of shared groups (display) | update self only |
| `groups` | members | `owner`/`admin` update; `owner` delete; create by any auth user |
| `group_members` | members of the same group | self-join via code/invite; `owner`/`admin` manage roles/removal; role changes owner-only |
| `invites` | group `owner`/`admin`; invitee by token/email | `owner`/`admin` create/revoke; invitee accepts (moves to `accepted`) |
| `cards` | members | `owner`/`admin` (host set) only |
| `challenges` | members | `owner`/`admin` only |
| `player_cards` | owner; (counts via leaderboard view) | owner only |
| `player_card_cells` | owner | owner only (marking) |
| `bingos` | group members (alerts) | trigger only; no direct client writes |
| `notifications` | recipient only | recipient may update `read_at`; inserts server-side only |

All policies pair `TO authenticated` **with** an ownership/membership predicate in `USING`
(and `WITH CHECK` for writes) — never role-only. "Host" reads/writes are gated by an
`EXISTS` on `group_members` with `role IN ('owner','admin')`.

## 10. Indexes (beyond PKs/uniques)
- `groups (join_code)` — join lookup (already unique).
- `group_members (user_id)`, `group_members (group_id)` — membership lookups.
- `invites (token)` (unique), `invites (group_id)`, `invites (email)`.
- `cards (group_id, status)` — active/history queries.
- `challenges (card_id)`.
- `player_cards (card_id)`, `player_cards (user_id)`.
- `player_card_cells (player_card_id)`, partial `(player_card_id) WHERE is_marked`.
- `bingos (card_id)`, `bingos (user_id)`.
- `notifications (user_id, created_at desc)`, partial `(user_id) WHERE read_at IS NULL`.

## 11. Resolved Decisions (see [`decisions.md`](./decisions.md))
- **Leaderboard** — `security_invoker` **view**; now includes weighted **points**. **(D1)**
- **Data API exposure** — client `SELECT` only (RLS), writes via Server Actions;
  `bingos` written only by the trigger; `notifications` inserted server-side. **(D2)**
- **Auth** — email + password with **email confirmation; no 2FA**. **(D3)**
- **Bingo wins are revocable** — trigger **inserts and deletes**. **(D4)**
- **Card editing anytime** — per-square edit un-marks only that square across players (trigger
  revokes dependent bingos); grid/layout changes rebuild player cards. **(D5)**
- **Free space only on odd grids (5×5)** — CHECK on `cards.free_space`. **(D6)**
- **Realistic-app enrichment** — roles/co-hosts, invites, notifications, card
  drafts/scheduling/weighted points, avatars/usernames/group images, timestamps, indexes,
  Storage. Activity feed + reactions deferred. **(D7)**

## 12. Still Open / Deferred
- Exact `join_code` format/length (proposed: 6 chars, A–Z + 2–9, ambiguous excluded, retry
  on collision).
- **Ownership transfer** flow (updating `host_id` + `owner` role) — mechanics TBD.
- **Activity feed & reactions** — deferred (D7).
- Whether avatars/group images are **public-read** buckets or signed-URL private buckets.
- Anonymous/duplicate-account prevention remains **out of scope** (trust-based).
