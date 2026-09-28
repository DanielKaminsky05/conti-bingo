# Conti-Bingo — API Surface & Endpoints

**Status:** Draft v0.2 · **Last updated:** 2026-09-28
**Relates to:** [`requirements.md`](./requirements.md), [`data-model.md`](./data-model.md), [`test-plan.md`](./test-plan.md), [`best-practices.md`](./best-practices.md), [`decisions.md`](./decisions.md)

> **Architecture note.** Per `best-practices.md`, first-party mutations are **Server
> Actions** (`'use server'`), reads happen in **Server Components** (direct Supabase
> queries) or via typed query helpers, and only genuinely public/non-UI things are
> **Route Handlers**. The leaderboard is exposed as a Postgres **view** (D1). So "endpoint"
> below means one of: **Action**, **Query** (server read helper), **Route** (HTTP handler),
> **RPC** (Postgres function), **Realtime** (subscription channel), or **Storage** (a
> Supabase Storage bucket operation).
>
> Every Action/Route: (1) authenticates via `supabase.auth.getUser()`, (2) validates input
> with a Zod schema, (3) relies on **RLS** as the ultimate authorization backstop. Test
> cases below always include the auth-negative and validation-negative paths.

---

## 1. Endpoint Index

| # | Endpoint | Kind | Role | Purpose |
|---|---|---|---|---|
| **Auth** (email confirmation, no 2FA — D3) |
| A1 | `signUp` | Action | public | Create account (email, name, password) → sends confirmation email |
| A2 | `signIn` | Action | public | Password sign-in (requires confirmed email) |
| A3 | `signOut` | Action | auth | End session |
| A4 | `resendConfirmation` | Action | public | Re-send the confirmation email |
| A6 | `GET /auth/callback` | Route | public | Handle email-confirmation link → set session |
| **Profile** (D7) |
| U1 | `getProfile` | Query | auth | Own or a group-mate's public profile |
| U2 | `updateProfile` | Action | auth | Edit `username` (unique) + display `name` |
| U3 | `uploadAvatar` | Storage+Action | auth | Upload/replace avatar → set `avatar_path` |
| U4 | `removeAvatar` | Action | auth | Clear avatar back to default |
| **Groups** |
| G1 | `createGroup` | Action | auth→owner | Create a group; creator becomes `owner` member |
| G2 | `getGroup` | Query | member | Group details + membership |
| G3 | `listMyGroups` | Query | auth | Groups the user owns or belongs to |
| G4 | `updateGroup` | Action | owner/admin | Edit name, description, `join_locked` |
| G5 | `deleteGroup` | Action | owner | Delete group (cascades) |
| G6 | `joinGroup` | Action | auth | Join via `join_code` (blocked if `join_locked`) |
| G7 | `leaveGroup` | Action | member | Leave a group (owner must transfer first) |
| G8 | `listMembers` | Query | member | Roster + roles |
| G9 | `removeMember` | Action | owner/admin | Remove a member |
| G10 | `regenerateJoinCode` | Action | owner/admin | Rotate the join code |
| G11 | `updateMemberRole` | Action | owner | Set a member's role (`admin` co-host / `member`) |
| G12 | `archiveGroup` | Action | owner | Set group `status = archived` (or reactivate) |
| G13 | `uploadGroupImage` | Storage+Action | owner/admin | Upload/replace group image → `image_path` |
| **Invitations** (D7) |
| V1 | `createInvite` | Action | owner/admin | Create an email/link invite (role, expiry) |
| V2 | `listInvites` | Query | owner/admin | Pending/expired invites for a group |
| V3 | `revokeInvite` | Action | owner/admin | Revoke a pending invite |
| V4 | `getInviteByToken` | Query | public | Preview an invite (group name) before accepting |
| V5 | `acceptInvite` | Action | auth | Accept via token → become member with invited role |
| **Cards** |
| C1 | `createCard` | Action | owner/admin | Author a card (starts as **draft**) |
| C2 | `getActiveCard` | Query | member | The group's current active card + challenges |
| C3 | `updateCard` | Action | owner/admin | Edit title/description/challenges/config/points/schedule |
| C4 | `replaceActiveCard` | Action | owner/admin | Archive current active card, activate another |
| C5 | `listArchivedCards` | Query | member | Card history for the group |
| C6 | `getCard` | Query | member | A specific (draft/active/archived) card |
| C7 | `publishCard` | Action | owner/admin | Draft → active (archives current active) |
| C8 | `listDraftCards` | Query | owner/admin | The group's unpublished drafts |
| **Notifications** (D7) |
| N1 | `listNotifications` | Query | auth | Recipient's notifications (paged) |
| N2 | `markNotificationRead` | Action | recipient | Mark one / all as read |
| N3 | `notifications` (own) | Realtime | recipient | Live unread badge + center |
| **Play** |
| P1 | `getOrCreatePlayerCard` | Action | member | Materialize this player's card (layout applied) |
| P2 | `getPlayerCard` | Query | owner | A player's cells + marks |
| P3 | `markCell` | Action | owner | Toggle a square (honor-system) |
| **Leaderboard / Wins** |
| L1 | `leaderboard` (by card) | View | member | Ranked standings (bingos, points, squares) |
| L2 | `bingos:insert/delete` (card scope) | Realtime | member | "First to bingo" alerts + revokes |
| L3 | `player_card_cells` (own) | Realtime | owner | Live self-progress / leaderboard deltas |
| **Ops** |
| O1 | `GET /api/health` | Route | public | Liveness check |

> **No `createBingo` endpoint exists by design** — bingos are written only by the
> `check_bingo()` DB trigger (see `data-model.md` §5). Clients cannot insert them.

---

## 2. Endpoint Detail & Test Cases

Legend for test types: **U** = unit (`lib/bingo`, validation), **I** = DB/integration
(RLS, trigger, constraints), **E** = end-to-end (Playwright). Cross-refs point at
`test-plan.md`.

### Auth

#### A1 `signUp(input)`
- **Function:** Register a user with email, name, password via Supabase Auth; create the
  `profiles` row (trigger or explicit insert).
- **Input:** `{ email, name, password }` — Zod: valid email, name 1–80 chars, password
  policy (min length etc.).
- **Returns:** `{ userId }` (unconfirmed) or an "email already registered" error. Supabase
  sends a **confirmation email**; the account is unverified until confirmed. (D3)
- **Test cases:**
  - E: happy path — sign up → account created **unconfirmed** → confirmation email sent. *(§6.1)*
  - U: schema rejects invalid email / short password / empty name.
  - I: `profiles.id` == `auth.users.id`; duplicate email rejected.

#### A2 `signIn(input)`
- **Function:** Password sign-in. **Requires a confirmed email** — an unconfirmed account
  cannot establish a session.
- **Input:** `{ email, password }`.
- **Returns:** authenticated session, `email_not_confirmed`, or invalid-credentials error.
- **Test cases:**
  - E: sign in after confirming email succeeds. *(§6.1)*
  - E: sign in before confirming → `email_not_confirmed`, no session.
  - E: wrong password → generic error, no session.

#### A3 `signOut()`
- **Function:** Revoke the current session; clear cookies.
- **Test cases:** E: after sign-out, protected routes redirect to sign-in.

#### A4 `resendConfirmation(input)`
- **Function:** Re-send the confirmation email for an unconfirmed address.
- **Input:** `{ email }`.
- **Test cases:** E: requesting resend for an unconfirmed email sends a new link; a confirmed
  or unknown email is handled without leaking which case it was.

#### A6 `GET /auth/callback`
- **Function:** Exchange the email-confirmation code for a session cookie, then redirect.
- **Security:** **Same-origin redirect guard** — reject external `redirect_url`.
- **Test cases:**
  - I/E: valid confirmation link sets session / marks confirmed and redirects. *(§6.1)*
  - E: `redirect_url` pointing off-origin → 400 (open-redirect guard).

### Profile

#### U1 `getProfile(userId?)` / U2 `updateProfile(input)`
- **Function:** Read a profile (own, or a group-mate's public fields); update own
  `username` + `name`.
- **Input (U2):** `{ username, name }` — username 3–20 chars, `[a-z0-9_]`, unique
  (case-insensitive); name 1–80 chars.
- **Test cases:**
  - U: username/name schema; reserved/invalid usernames rejected.
  - I: `username` uniqueness is **case-insensitive** (`Dana` vs `dana` collide). *(§4.1)*
  - I (RLS): a user can update **only their own** profile; can read group-mates' public
    fields but not edit them. *(§4.3)*

#### U3 `uploadAvatar(file)` / U4 `removeAvatar()`
- **Function:** Upload/replace the avatar in the `avatars/{user_id}/…` Storage path and set
  `profiles.avatar_path`; remove clears it.
- **Validation:** content-type image/*, max size (e.g. 5 MB), dimensions optional.
- **Test cases:**
  - I (Storage RLS): a user can write **only their own** `avatars/{uid}/…` folder; cannot
    write another user's folder (upsert needs INSERT+SELECT+UPDATE). *(§4.3)*
  - U: rejects non-image / oversized file.
  - E: upload avatar → it appears on profile and leaderboard; remove restores default. *(new)*

### Groups

#### G1 `createGroup(input)`
- **Function:** Insert `groups` (host = `auth.uid()`), generate unique `join_code`, insert a
  `group_members` row for the creator with `role='owner'`.
- **Input:** `{ name, description? }` — name 1–80 chars.
- **Returns:** `{ groupId, joinCode }`.
- **Side effects:** creator auto-enrolled as the **owner** member.
- **Test cases:**
  - E: host creates group → sees it in "my groups" with a shareable code. *(§6.2)*
  - U: name validation.
  - I: `join_code` unique; owner row present in `group_members` (role=`owner`); the
    one-owner partial unique holds. *(§4.1)*
  - I (RLS): unauthenticated call rejected.

#### G2 `getGroup(groupId)` / G3 `listMyGroups()` / G8 `listMembers(groupId)`
- **Function:** Reads scoped by membership.
- **Test cases:**
  - I (RLS): member of A can read A; member of B **cannot** read A. *(§4.3)*
  - I: `listMyGroups` returns both hosted and joined groups; excludes others.

#### G4 `updateGroup` / G5 `deleteGroup` / G12 `archiveGroup`
- **Function:** `updateGroup` edits name/description/`join_locked` (owner or admin);
  `deleteGroup` is **owner-only** and cascades; `archiveGroup` flips `status` to
  `archived`/`active` (owner-only).
- **Test cases:**
  - I (RLS): a `member` cannot update/delete/archive; an `admin` can update but **not**
    delete; the `owner` can do all. *(§4.3)*
  - I: delete cascades (no orphan rows). *(§4.1)*
  - E: archived group is read-only / hidden from active list but still browsable.

#### G6 `joinGroup(input)`
- **Function:** Resolve `join_code` → group; insert `group_members(group_id, uid,
  role='member')`; idempotent if already a member. **Rejected when `join_locked=true`.**
- **Input:** `{ joinCode }`.
- **Returns:** `{ groupId }` or "invalid code" / "joining disabled".
- **Test cases:**
  - E: player joins via code and lands on the group. *(§6.3)*
  - I: invalid/unknown code rejected; a user **cannot** self-insert without a valid code
    (RLS `WITH CHECK`); `join_locked` blocks new joins. *(§4.3)*
  - I: joining twice doesn't create a duplicate (unique constraint). *(§4.1)*

#### G7 `leaveGroup` / G9 `removeMember` / G10 `regenerateJoinCode`
- **Function:** A member leaves; owner/admin removes others; owner/admin rotates the code.
  **The `owner` cannot leave without transferring ownership first** (see §5 open item).
- **Test cases:**
  - I (RLS): a `member` can remove **only themselves**; `owner`/`admin` can remove others; a
    `member` cannot remove another member. *(§4.3)*
  - I: owner leaving without transfer is rejected.
  - I: after `regenerateJoinCode`, the old code no longer resolves.

#### G11 `updateMemberRole(input)`
- **Function:** Owner promotes/demotes a member between `admin` (co-host) and `member`.
- **Input:** `{ groupId, userId, role: 'admin' | 'member' }`.
- **Test cases:**
  - I (RLS): **owner-only**; an `admin` cannot change roles; cannot set a second `owner`
    (partial unique) — ownership moves via transfer, not this endpoint. *(§4.3, §4.1)*
  - E: promoting a member to admin grants host controls (author cards, invite).

#### G13 `uploadGroupImage(file)`
- **Function:** Upload/replace the group image in `group-images/{group_id}/…` and set
  `groups.image_path`.
- **Test cases:**
  - I (Storage RLS): only `owner`/`admin` of that group may write its folder; members read.
    *(§4.3)*
  - U: rejects non-image / oversized file.

### Invitations

#### V1 `createInvite` / V2 `listInvites` / V3 `revokeInvite`
- **Function:** Owner/admin creates an invite (email optional, generates `token`, sets
  `role` + `expires_at`), lists a group's invites, or revokes a pending one.
- **Input (V1):** `{ groupId, email?, role: 'member' | 'admin', expiresInHours? }`.
- **Side effects:** V1 may enqueue an email + a `notification` to an existing user.
- **Test cases:**
  - I (RLS): only `owner`/`admin` can create/list/revoke; members cannot. *(§4.3)*
  - I: `token` is unique; expiry stored; revoke sets `status='revoked'`.
  - U: role/email/expiry validation.

#### V4 `getInviteByToken(token)`
- **Function:** Public preview of a valid invite (group name/image) so the invitee sees what
  they're joining before signing in. Reveals no member data.
- **Test cases:**
  - I: valid pending token returns minimal group info; expired/revoked/unknown → not found.
  - I: does not leak roster or other group data.

#### V5 `acceptInvite(token)`
- **Function:** Authenticated user accepts: insert `group_members` with the invite's `role`,
  set invite `status='accepted'`, `accepted_by`/`accepted_at`. Idempotent if already a member.
- **Test cases:**
  - E: invited user signs up/in, opens the link, and joins with the correct role. *(new)*
  - I: expired/revoked token rejected; a token can't be accepted twice; email-scoped invite
    only acceptable by that email (if enforced). *(§4.3)*
  - I: accepting as `admin` grants co-host role.

### Cards

#### C1 `createCard(input)`
- **Function:** Create a `cards` row (**`status=draft`** — D7) + its `challenges`; enforce
  challenge count fits the grid. Drafts are unrestricted; going live happens via `publishCard`.
- **Input:** `{ groupId, title, description?, gridSize ∈ {4,5,6}, layoutMode, freeSpace,
  winCondition, startsAt?, endsAt?, challenges: { text, points? }[] }`.
- **Validation:** `challenges.length >= gridSize² − (freeSpace ? 1 : 0)`; non-empty texts;
  `points > 0`; `gridSize` in {4,5,6}; **`freeSpace` true only on odd grids (5×5)** (D6);
  `endsAt > startsAt` when both set.
- **Returns:** `{ cardId }` (draft).
- **Test cases:**
  - E: host authors a 5×5 draft, sets points/schedule, then publishes. *(§6.2)*
  - U: rejects `gridSize` 3/7; too-few challenges; `freeSpace` on 4×4/6×6; `points ≤ 0`;
    `endsAt ≤ startsAt`; trims/validates text. *(§3.5)*
  - I: `grid_size` + `free_space` + `ends_at` CHECKs enforced. *(§4.1)*
  - I (RLS): a `member` cannot create a card; `owner`/`admin` can. *(§4.3)*

#### C7 `publishCard(cardId)` / C8 `listDraftCards(groupId)`
- **Function:** `publishCard` transitions a **draft → active**, archiving the group's current
  active card in the same transaction (respects the one-active partial unique). `listDraftCards`
  returns the group's unpublished drafts (owner/admin only).
- **Test cases:**
  - E: publishing a draft makes it active and archives the previous card. *(§6.2/§6.5)*
  - I: never two active cards mid-transaction; publishing a scheduled card respects
    `starts_at` if enforced. *(§4.1)*
  - I (RLS): only `owner`/`admin` publish/list drafts; members can't see drafts. *(§4.3)*

#### C2 `getActiveCard(groupId)` / C5 `listArchivedCards(groupId)` / C6 `getCard(cardId)`
- **Function:** Member-scoped reads. `getActiveCard` returns config + challenges;
  `listArchivedCards` returns history with final standings.
- **Test cases:**
  - I (RLS): only members read; non-members blocked. *(§4.3)*
  - E: browse a previous card and see its final leaderboard. *(§6.5)*

#### C3 `updateCard(input)`
- **Function:** Host edits title/challenges/config **at any time**, including mid-play (D5):
  - **Editing a single challenge's text** → un-marks that one square on **every** player's
    card (`is_marked=false` where it pointed at that `challenge_id`); the trigger revokes any
    bingo that relied on it (D4). Other marks preserved.
  - **Adding/removing a challenge** → affects only the added/removed cell(s); removed cells
    clear their marks + dependent bingos first.
  - **Changing `grid_size` / `layout_mode` / `free_space`** → rebuilds every player's
    `player_card_cells` and resets that card's marks (UI warns first).
  - **Editing a challenge's `points`** → no cell rebuild; leaderboard totals recompute.
  - **Editing `title` / `description` / `starts_at` / `ends_at`** → no effect on player cards.
- **Test cases:**
  - I (RLS): `owner`/`admin` only; a `member` cannot edit. *(§4.3)*
  - I: changing points updates leaderboard scores without touching marks/bingos. *(§3.4)*
  - I/E: editing one square un-marks only that square across players and revokes its bingo;
    other marks stay. *(new — §4.2/§10)*
  - I/E: changing grid size rebuilds player cards and resets marks (with warning). *(§10)*
  - U: `freeSpace` validity re-checked on grid-size change (odd-only). *(§3.1, D6)*

#### C4 `replaceActiveCard(input)`
- **Function:** Transactionally archive the current active card (`status=archived`) and
  create a new active one; existing player_cards remain attached to the archived card.
- **Test cases:**
  - E: replace card → old archived & browsable, new active; players get fresh player_cards. *(§6.5)*
  - I: never two active cards mid-transaction (partial unique index holds). *(§4.1)*

### Play

#### P1 `getOrCreatePlayerCard(cardId)`
- **Function:** If the caller has no `player_cards` row for the active card, create it and
  materialize `player_card_cells`:
  - **identical** mode → positions follow `challenges.sort_index`;
  - **shuffled** mode → deterministic per-player shuffle of the challenge pool;
  - free space (odd grids) placed center, `is_marked=true`.
- **Returns:** the player card + cells.
- **Test cases:**
  - U: `buildIdenticalLayout` / `buildShuffledLayout` correctness — full grid, unique
    positions, no repeats, deterministic, rejects insufficient pool. *(§3.1)*
  - E: two players in **shuffled** get different grids; **identical** get the same. *(§6.4)*
  - I: unique `(card_id, user_id)` — calling twice returns the same card, no dup. *(§4.1)*
  - I (RLS): only a group member can materialize a card for that group.

#### P2 `getPlayerCard(playerCardId)`
- **Test cases:**
  - I (RLS): owner reads own cells; **cannot** read another player's cells (IDOR). *(§4.3)*

#### P3 `markCell(input)`
- **Function:** Toggle `is_marked` (+ `marked_at`) for one cell. The DB trigger evaluates
  wins and **inserts or deletes** `bingos` to match current marks (revocable — D4).
- **Input:** `{ playerCardId, position, marked }` — position `0..gridSize²−1`.
- **Test cases:**
  - E: mark squares to complete a line → own bingo confirmation appears. *(§6.3)*
  - I (RLS): a player can mark **only their own** cells; cannot mark another's. *(§4.3)*
  - I (RLS UPDATE): cannot reassign a cell's `user_id`/`player_card_id`. *(§4.3)*
  - I (trigger): completing a row inserts exactly one `line` bingo with correct `line_key`;
    re-marking is idempotent; columns/diagonals detected; free space participates (5×5);
    blackout only when full; per grid size 4/5/6. *(§4.2)*
  - I (trigger, revoke): **unmarking** a bingo-contributing cell **deletes** that bingo;
    re-completing re-inserts it. *(§4.2, D4)*
  - U: `completedLines` / `isBlackout` geometry independent of DB. *(§3.2)*

### Leaderboard / Wins

#### L1 `leaderboard` (`security_invoker` view, filtered by `card_id`) — D1
- **Function:** Return players ranked by **bingos desc → points desc → squares desc →
  earliest `first_bingo_at`**; includes players with zero marks. Points = sum of
  `challenges.points` over marked cells (weighted — D7). A view (not an RPC), read directly
  by the client under RLS.
- **Test cases:**
  - U: `rankPlayers` ordering + tie-breaks (incl. points) + zero-mark inclusion. *(§3.4)*
  - I: weighted points aggregate correctly; changing a challenge's points shifts ranking.
  - I (RLS): a member sees the group's standings; a non-member gets nothing;
    `security_invoker` respects RLS. *(§4.3)*

#### L2 `bingos` insert/delete (Realtime, card-scoped)
- **Function:** Clients subscribe to `bingos` changes for the active card → **insert** =
  "first to bingo" toast + leaderboard bump; **delete** = a revoked win updates the
  leaderboard (D4).
- **Test cases:**
  - E: two browser contexts — P1 wins, **P2 receives the alert** and leaderboard updates
    live (< ~2s). *(§6.4, §7)*
  - E: P1 unmarks → the revoke propagates and the leaderboard drops the win. *(D4)*
  - I: Realtime delivers only rows the subscriber may read under RLS.

#### L3 `player_card_cells` (Realtime, own)
- **Function:** Live self-progress; optional live leaderboard deltas.
- **Test cases:** E: marking updates the player's own view without refresh.

### Notifications (D7)

#### N1 `listNotifications` / N2 `markNotificationRead` / N3 `notifications` (Realtime)
- **Function:** Recipient lists their notifications (paged, unread-first), marks one or all
  read, and subscribes for a live unread badge. Notifications are **written server-side**
  (triggers / Server Actions on events like member joined, bingo achieved, out-bingoed, card
  published/replaced, invite received) — **clients never insert them**.
- **Test cases:**
  - I (RLS): a user reads/updates **only their own** notifications; cannot read another
    user's; **cannot insert** a notification directly. *(§4.3)*
  - I: `markNotificationRead` sets `read_at`; "mark all" clears the group.
  - I (trigger): a bingo insert notifies the relevant group members (e.g. out-bingoed);
    a member join notifies owner/admins.
  - E: winning in one browser raises a notification badge in another user's session. *(§6.4)*

### Ops

#### O1 `GET /api/health`
- **Function:** Return `200 {status:"ok"}` for uptime checks; no auth, no data access.
- **Test cases:** I/E: returns 200; never leaks build/internal info.

---

## 3. Cross-Cutting Test Requirements
Applied to **every** Action/Route (in addition to the specifics above):
1. **Auth-negative** — unauthenticated call is rejected (no data leaked). *(§4.3, §5)*
2. **Validation-negative** — malformed input rejected by the Zod schema with a safe error.
3. **Authorization-negative** — wrong role / wrong group / wrong owner is blocked by RLS
   *and* surfaces a clean error from the Action (not a raw `0 rows`). *(§4.3)*
4. **Idempotency** where relevant (join, acceptInvite, getOrCreatePlayerCard, mark→bingo insert).
5. **Advisors** — `get_advisors` clean after any schema/policy change. *(§4.4)*
6. **Storage RLS** (U3/G13) — writes limited to the owner's / group's folder; upsert needs
   INSERT+SELECT+UPDATE.

## 4. Concurrency & Load (from test-plan §7)
- ~80 members in one group calling `markCell` concurrently → trigger + `leaderboard` view
  stay correct and responsive; no duplicate bingos; leaderboard converges.

## 5. Resolved Decisions (see [`decisions.md`](./decisions.md))
- **Auth** — email + password with **email confirmation; no 2FA** (A1/A2/A4/A6). **(D3)**
- **`updateCard` — editable anytime**; a per-square edit un-marks only that square across
  players (trigger revokes dependent bingos); grid/layout changes rebuild player cards;
  `replaceActiveCard` still archives + starts a new card. **(D5)**
- **Unmark semantics** — wins are **revocable**; the trigger inserts and **deletes** (P3/L2). **(D4)**
- **Leaderboard** — a `security_invoker` **view** (L1). **(D1)**
- **Data API exposure** — client gets **`SELECT` only** (RLS-guarded, needed for Realtime on
  G2/G8/C2/C5/P2/L2/L3); all writes via Server Actions. **(D2)**
- **Even-grid free space** — `free_space` only on odd grids (5×5); forced off for 4×4/6×6.
  Affects C1 validation and P1 layout/win math. **(D6)**
- **Realistic-app surface** — roles/co-hosts (G11), invitations (V1–V5), notifications
  (N1–N3), profile + avatars (U1–U4), group image (G13), card drafts/publish/schedule
  (C1/C3/C7/C8), and weighted points (L1). Activity feed + reactions deferred. **(D7)**

## 6. Still Open (endpoint contracts)
- **Ownership transfer** endpoint (owner → another member) — needed before an owner can
  leave (G7). Mechanics TBD (updates `host_id` + `owner` role atomically).
- **Email-scoped invites** — whether V5 enforces that the accepting user's email matches the
  invite's `email`, or the token alone suffices.
- **Scheduled activation** — whether a card with a future `starts_at` auto-activates (needs a
  cron/`pg_cron` job) or `publishCard` is always manual.
- Avatar/group-image buckets **public-read vs signed-URL private**.
