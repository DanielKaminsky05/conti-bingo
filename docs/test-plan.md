# Conti-Bingo — Test Plan

**Status:** Draft v0.2 · **Last updated:** 2026-09-28
**Relates to:** [`requirements.md`](./requirements.md), [`data-model.md`](./data-model.md), [`api-endpoints.md`](./api-endpoints.md), [`decisions.md`](./decisions.md)

## 1. Goals & Scope
Verify that conti-bingo behaves correctly across its per-group roles (owner, admin/co-host,
member) and the core loop: sign up → create/join group → author/publish card → play/mark →
win → leaderboard.
Given the app is multi-tenant (many groups) and honor-system, the **highest-risk areas**
get the most coverage:

1. **RLS / data isolation** — no user or group can read or write another's data.
2. **Win-detection trigger** — correct, idempotent bingo detection across grid sizes and
   win conditions.
3. **Shuffled vs identical layouts** — each player's card is well-formed.
4. **Real-time** — leaderboard and "first to bingo" alerts propagate.

Out of scope (matches requirements): anti-cheat/verification, native apps, grade syncing.

## 2. Test Levels & Tooling
| Level | What it covers | Recommended tool |
|---|---|---|
| **Unit** | Pure logic: shuffle, win-line math, join-code gen, leaderboard ranking, validation | **Vitest** |
| **Database / integration** | Postgres trigger, constraints, and **RLS policies** run against real SQL | **pgTAP** (in-DB) and/or a seeded test database driven by supabase-js |
| **API / component** | Next.js route handlers / server actions, React components | Vitest + Testing Library; MSW for mocking where needed |
| **End-to-end** | Full user journeys in a browser against a running app + test DB | **Playwright** |

Run unit + DB + API in CI on every PR; run e2e on PR and pre-deploy.

## 3. Unit Tests (Vitest)

### 3.1 Card layout
- `buildIdenticalLayout(challenges, gridSize, freeSpace)` → positions match
  `challenges.sort_index`; free space placed at center (odd grids) and marked `true`.
- `buildShuffledLayout(challenges, gridSize, freeSpace, seed)`:
  - Returns exactly `gridSize²` cells, positions `0..n-1` unique.
  - Every non-free position maps to a distinct challenge; no challenge repeats.
  - Deterministic given a seed (so tests are stable).
  - Rejects when `challenges.length < needed` (grid² − freeSpace).

### 3.2 Win-line math (the geometry, independent of DB)
- `completedLines(markedPositions, gridSize)` returns correct `line_key`s:
  - Full row → `row-{r}`; full column → `col-{c}`; diagonals → `diag-0` / `diag-1`.
  - Free space counts as marked.
  - No false positives on partially-filled lines.
  - Works for 4×4, 5×5, 6×6 (note: 4×4/6×6 have no single center free square — verify
    free-space placement rules for even grids).
- `isBlackout(markedPositions, gridSize)` → true only when all cells marked.

### 3.3 Join codes
- `generateJoinCode()` → matches agreed format (e.g. 6-char A–Z/0–9), excludes ambiguous
  chars if decided; uniform-ish distribution smoke test.

### 3.4 Leaderboard ranking
- `rankPlayers(players)` sorts by **bingos desc → points desc → squares desc → earliest
  `first_bingo_at`** (weighted points — D7).
- Ties broken deterministically; a player with 0 marks still appears.
- Points = sum of marked `challenges.points`; changing a challenge's points reorders ranks.

### 3.5 Validation
- Card authoring: `grid_size ∈ {4,5,6}`; challenge count sufficient; non-empty text;
  `points > 0`; `free_space` only on odd grids (D6); `endsAt > startsAt` when both set.
- Profile: `username` 3–20 chars `[a-z0-9_]`, reserved names rejected; `name` 1–80 chars.
- Invite: valid email (when provided), `role ∈ {member, admin}`, positive expiry.
- Avatar/image upload: content-type `image/*`, size ≤ limit.

## 4. Database / Integration Tests (pgTAP or seeded DB)

### 4.1 Constraints
- **One active card per group** — inserting a 2nd `active` card for a group fails; a group
  may have many `draft` and `archived` cards. (D7)
- `cards.grid_size` CHECK rejects 3 and 7.
- `cards.free_space` CHECK rejects `true` on even grids (4×4, 6×6). (D6)
- `cards.ends_at` CHECK rejects `ends_at <= starts_at`. (D7)
- `challenges.points` CHECK rejects `points <= 0`. (D7)
- **One owner per group** — the partial unique on `group_members(group_id) WHERE
  role='owner'` blocks a second owner. (D7)
- `profiles.username` is **unique case-insensitively** (`Dana`/`dana` collide). (D7)
- `invites.token` unique; `group_members(group_id,user_id)`, `player_cards(card_id,user_id)`,
  `player_card_cells(player_card_id,position)`, `bingos(player_card_id,line_key)`.
- Cascade deletes: deleting a group removes members, invites, cards (→ challenges,
  player_cards, cells, bingos), and its notifications; deleting a card removes its children.

### 4.2 Win-detection trigger — `check_bingo()` (wins are revocable — D4)
- Marking cells to complete a **row** inserts exactly one `line` bingo with the right
  `line_key`.
- Completing the **same line twice** (re-mark) does **not** create a duplicate (idempotent
  via unique index).
- Column and both diagonals detected.
- **Free space** (5×5 only) participates in its row/col/diagonal automatically.
- `win_condition = 'blackout'`: no bingo until every cell marked; then one `blackout` row.
- **Unmark revokes:** unmarking a cell that had completed a line **deletes** that `bingo`
  row; **re-completing** the line inserts it again. Blackout is removed when the grid stops
  being full. (D4)
- Unmarking a cell that did **not** break any completed line leaves other bingos intact.
- Trigger fires correctly for **each grid size** (4/5/6).

### 4.3 RLS policies (critical — one test per policy, positive AND negative)
Set up: two groups A and B, each with an `owner`, an `admin` (co-host), and `member`s. For
every table assert positive and negative:
- **profiles** — a user can read own; can read group-mates' public fields; **cannot** update
  another user's profile.
- **groups** — members read; `owner`/`admin` update; only `owner` delete/archive; a `member`
  can do none of these. A member of B **cannot** read A.
- **cards / challenges** — members read (drafts only visible to `owner`/`admin`); only
  `owner`/`admin` insert/update; a `member` **cannot**.
- **group_members** — a user can join via valid `join_code` (blocked when `join_locked`) or
  accept an invite; cannot insert themselves otherwise; `owner`/`admin` remove others; a
  `member` removes only self; **only `owner`** changes roles / cannot create a 2nd owner.
- **invites** — `owner`/`admin` create/list/revoke; a `member` cannot; `getInviteByToken`
  reveals only minimal group info and no roster; expired/revoked tokens rejected.
- **notifications** — recipient reads/updates **only their own**; cannot read another user's;
  **cannot insert** directly (server/trigger only).
- **player_cards / player_card_cells** — a player can read/mark **only their own** cells;
  cannot read or mark another player's cells (BOLA/IDOR check).
- **bingos** — group members can read the group's bingos; **no** client can directly
  insert/delete a bingo (only the trigger writes them).
- **UPDATE needs USING + WITH CHECK** — a player cannot reassign a `player_card`/cell to
  another `user_id`; a user cannot self-promote their `group_members.role`.

### 4.4 Storage RLS (D7)
- **avatars** bucket — a user can upload/replace/delete only under `avatars/{their uid}/…`
  (upsert needs INSERT+SELECT+UPDATE); cannot write another user's folder; read allowed to
  authenticated.
- **group-images** bucket — only a group's `owner`/`admin` can write `group-images/{gid}/…`;
  members can read; non-members cannot.

### 4.5 Advisors
- After schema is applied, `get_advisors` (security + performance) returns no unresolved
  RLS or policy warnings.

## 5. API / Component Tests
- **Server actions / route handlers**: create group, join by code (valid/invalid/locked),
  author **draft** card, **publish** card, edit card (per-square reset, points), generate
  player_cards, mark a cell, fetch leaderboard; profile update + avatar upload; **invite
  create/accept/revoke**; **role change**; **notification list/mark-read**. Assert auth
  required and correct error codes for unauthorized/not-found.
- **Components**: bingo grid renders `gridSize²` cells; tapping toggles mark + optimistic
  UI; free space shown pre-marked and non-interactive; leaderboard list renders ranks +
  points; "first to bingo" toast; **notification center** badge/list; avatar + group image
  render (with default fallback); host-only controls hidden from `member`s.

## 6. End-to-End Tests (Playwright)
Run against a running Next.js app + a dedicated seeded Supabase test project/branch.

### 6.1 Auth (email confirmation, no 2FA — D3)
- Sign up (email + name + password) → account created **unconfirmed** → confirm via the
  emailed link (captured from the Supabase test inbox / Inbucket) → sign in → sign out.
- An **unconfirmed** user cannot access protected routes / is prompted to confirm.
- Wrong password → generic error, no session.

### 6.2 Host happy path
- Host signs up → sets profile (username + **avatar**) → creates group (with **image**) →
  authors a 5×5 card as a **draft** (challenges with **points**) → **publishes** it → gets a
  join link/code → sees the card active.

### 6.3 Player happy path
- Player signs up → joins via code → sees their card (correct size/layout) → marks squares
  → completes a line → sees own bingo confirmation.

### 6.4 Multiplayer / real-time (two browser contexts)
- Player 1 completes a bingo; **Player 2 receives the "first to bingo" alert**, a
  **notification**, and the **leaderboard updates live** without refresh.
- Player 1 **unmarks** → the win is **revoked** live on Player 2's leaderboard. (D4)
- Two players in **shuffled** mode have **different** grids; in **identical** mode, the same.

### 6.5 Invitations & roles (D7)
- Owner **invites** a specific email → invitee opens the link → signs up/in → **accepts** →
  becomes a member (or **admin** if invited as co-host).
- A promoted **admin** (co-host) can author/publish cards and invite; a demoted member loses
  those controls. Revoked/expired invite links are rejected.

### 6.6 Card lifecycle
- Host **replaces** the active card → old card is **archived** and still browsable with its
  final leaderboard; new card becomes active; players get fresh player_cards.
- Editing a single square on the active card un-completes only that square for players and
  revokes any dependent bingo (D5); other marks remain.

### 6.7 Notifications (D7)
- The notification center shows events (joined, out-bingoed, card published, invite) with an
  unread badge; marking read clears the badge; badge updates live across sessions.

### 6.8 Isolation (security-flavored e2e)
- A member of Group B cannot open or mark Group A's card, read A's notifications, or manage
  A's invites via direct URL/id manipulation.

## 7. Non-Functional Checks
- **Mobile-first**: e2e runs in a mobile viewport; tap targets usable; marking is fast.
- **Realtime latency**: alert/leaderboard update observed within a reasonable threshold
  (e.g. < 2s) in the multiplayer test.
- **Load (light)**: simulate ~80 players in one group marking concurrently — trigger and
  leaderboard remain correct and responsive (matches ~section size).

## 8. Test Data & Environments
- **Ephemeral test DB** — use a **Supabase branch** (or a disposable project) seeded before
  each run; never test against production data.
- **Seed helpers** — factory functions to create users (with profiles/usernames), a group
  with members **of each role** (owner/admin/member), invites, a **draft and active** card
  with weighted challenges, player_cards, and notifications, so tests start from known state.
- **Isolation** — each e2e spec uses its own group/users to avoid cross-test interference;
  reset or namespace between runs.

## 9. CI Strategy
- **On every PR:** unit + DB/integration + API/component. Fast, no browser.
- **On PR + pre-deploy:** Playwright e2e against a fresh seeded branch.
- **After any schema/migration change:** run pgTAP RLS suite + `get_advisors` and fail the
  build on new security advisories.
- Report coverage; gate on the high-risk modules (win math, RLS, trigger) rather than a
  blanket %.

## 10. Resolved Decisions (see [`decisions.md`](./decisions.md))
- **Auth** — email + password with **email confirmation, no 2FA**. §6.1 tests the confirm
  flow (via test inbox), not MFA. **(D3)**
- **Unmark behavior** — wins are **revocable**: unmarking revokes the bingo; re-completing
  re-inserts it. §4.2 asserts insert **and** delete transitions. **(D4)**
- **Card editing anytime** — editing one square un-marks only that square across players and
  revokes dependent bingos; grid/layout changes rebuild player cards. Add integration/e2e
  coverage for per-square edit-reset. **(D5)**
- **Even-grid free space** — `free_space` only on odd grids (5×5); forced off for 4×4/6×6.
  §3.1/§3.2 and §4.1 test the CHECK + layout. **(D6)**
- **Realistic-app enrichment** — coverage added for roles/co-hosts, invitations,
  notifications, profile/avatars, group image, card drafts/publish/scheduling, and weighted
  points across §3–§6 (Storage RLS in §4.4). Activity feed + reactions deferred. **(D7)**
