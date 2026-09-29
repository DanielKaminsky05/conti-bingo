# Conti-Bingo — Decision Log

**Status:** Living document · **Last updated:** 2026-09-28

Records resolved design decisions (confirmed by the product owner) so the other docs can
reference a single source of truth. Each entry: the decision, the rationale, and what it
affects.

---

## D1 — Leaderboard is a `security_invoker` view (not an RPC)
**Decision:** Expose standings as a Postgres **view** created with
`WITH (security_invoker = true)`, ranking players by bingos desc → squares desc → earliest
`achieved_at`, including zero-mark players.

**Why:** Simplest composable read; `security_invoker` makes it respect the caller's RLS so
it can't leak across groups; no bespoke RPC to maintain. Can be wrapped in an RPC later if
needed.

**Affects:** `data-model.md` §4, `api-endpoints.md` L1, `best-practices.md` §10.

---

## D2 — Reads via the Data API (RLS-guarded); writes via Server Actions only
**Decision:** `SELECT` access is granted to the `authenticated` role on the tables the
client needs (RLS enforces row visibility), so the browser can read and **subscribe via
Realtime**. All **mutations** go exclusively through Server Actions — no client-side
inserts/updates/deletes.

**Why:** Supabase **Realtime requires reading through the Data API**, and our "first to
bingo" alerts + live leaderboard depend on Realtime. Writes stay in Server Actions to keep
validation + authorization in one place; RLS still guards every read.

**Consequences:**
- Grant `SELECT` only to `authenticated` on: `groups`, `group_members`, `cards`,
  `challenges`, `player_cards`, `player_card_cells`, `bingos`, and the `leaderboard` view —
  each gated by RLS.
- **No** client `INSERT/UPDATE/DELETE` grants.
- `bingos` is written **only** by the `check_bingo()` trigger.

**Affects:** `data-model.md` §6/§7, `api-endpoints.md` read paths, `best-practices.md` §4/§6.

---

## D3 — No 2FA; email confirmation on sign-up
**Decision:** Authentication is **email + name + password**, with a **confirm-email step**
on sign-up (Supabase sends a confirmation link; the account is unverified until confirmed).
**Two-factor authentication (MFA/TOTP) is NOT part of the product.**

**Why:** 2FA is unnecessary friction for an informal, unofficial student game. Email
confirmation is enough to establish a real, unique-ish identity for the leaderboard.

**Consequences:**
- Remove all MFA/TOTP enrollment + challenge flows and screens.
- Sign-up flow: register → receive confirmation email → confirm → can sign in.
- `GET /auth/callback` handles the email-confirmation link.
- **Supersedes** the earlier "2FA required" language in the requirements.

**Affects:** `requirements.md` §5.1 + user stories + resolved-decisions table + §6,
`data-model.md` intro, `best-practices.md` §5, `api-endpoints.md` A1/A2/A4/A5/A6,
`test-plan.md` §6.1.

---

## D4 — Bingo wins are revocable (reflect current marks)
**Decision:** The `check_bingo()` trigger keeps `bingos` in sync with the actual marked
cells: it **inserts** a bingo when a line/blackout is completed and **deletes** the
corresponding `bingos` row if a contributing cell is later unmarked so the line is no longer
complete.

**Why:** The product owner wants the leaderboard to reflect the true current state — a bingo
should not persist if the player no longer has the completing line.

**Consequences:**
- Trigger fires on mark **and** unmark; on unmark it removes any `bingos` whose `line_key`
  is no longer satisfied (blackout removed if the grid is no longer full).
- "First to bingo" alerts fire on insert; a later revoke is a normal delete event.
- Idempotency still holds via `UNIQUE(player_card_id, line_key)` for inserts.
- Tests must cover: complete line → bingo; unmark → bingo removed; re-complete → bingo
  reappears; leaderboard reflects each transition.

**Affects:** `data-model.md` §5, `test-plan.md` §4.2, `api-endpoints.md` P3.

---

## D5 — Card structure is editable anytime (edits rebuild player cards)
**Decision:** The host may edit a card's **title, challenges, grid_size, layout_mode,
free_space, and win_condition at any time**, including mid-play.

**Why:** The product owner prioritizes flexibility over strict immutability.

**Scope of a change — least-disruptive rule:**
- **Editing a single challenge/square** (changing or replacing its text) **un-completes
  that one square on every player's card**: that cell's `is_marked` is reset to `false`
  wherever it was marked, and any `bingos` that depended on it are revoked (per D4). **All
  other marks on unaffected squares are preserved.** Players are not reset wholesale — only
  the touched square.
- **Adding / removing a challenge** affects only the added/removed cell(s); existing marks
  on other squares stay. Removed squares clear their marks (and dependent bingos) first.
- **Changing `grid_size` or `layout_mode`** is inherently structural and cannot preserve a
  per-cell mapping, so it **rebuilds each player's `player_card_cells`** and resets marks
  for that card (the trigger then re-evaluates bingos). The UI **warns the host** before
  such a change.
- A **title-only** edit does not touch player cards.
- `replaceActiveCard` still exists for starting a genuinely new card while **archiving** the
  old one with its final standings; `updateCard` is for in-place changes.

**Implementation note:** to make single-square edits cheap, `player_card_cells` reference
`challenge_id`; changing a challenge's text un-marks the cells pointing at it (and lets the
trigger revoke affected bingos) without rebuilding the whole card.

**Affects:** `api-endpoints.md` C1/C3/C4, `data-model.md` §2 (challenges/player_cards),
`test-plan.md` (new: per-square edit-reset behavior).

---

## D6 — Free space only on odd grids (5×5)
**Decision:** `free_space` is available **only for odd grid sizes** (5×5). For **4×4 and
6×6** there is no single center cell, so `free_space` is forced `false` and every cell holds
a challenge.

**Why:** A "free center square" is undefined for even grids. Avoids ambiguous layout/win
rules.

**Consequences:**
- Validation: reject `free_space = true` when `grid_size` is even.
- Challenge count: `challenges.length >= grid_size² − (free_space ? 1 : 0)`, and
  `free_space` can only be true for 5×5.
- Win math: free space participates in its row/col/diagonal only on 5×5.

**Affects:** `requirements.md` §5.3, `data-model.md` §2 (`cards.free_space`),
`test-plan.md` §3.1/§3.2, `api-endpoints.md` C1/P1.

---

## D7 — Enrich the data model toward a realistic app
**Decision:** Expand beyond the minimal game schema. **Included:** profile pictures +
usernames, group images/description, **member roles (owner/admin/member) with co-hosts**,
**email/token invitations**, **in-app notifications**, **card drafts + scheduling + weighted
challenge points**, plus universal `created_at/updated_at`, indexes, and Supabase **Storage
buckets** (avatars, group images) with RLS. **Excluded for now:** activity feed and emoji
reactions (revisit later).

**Why:** The product owner wants the model to reflect a real, shippable app rather than a
bare prototype.

**Affects:** `data-model.md` (v0.3 — new tables `invites`, `notifications`; enriched
`profiles`/`groups`/`group_members`/`cards`/`challenges`/`player_cards`; enums; storage;
indexes). Follow-on updates needed in `api-endpoints.md` (invite/notification/role
endpoints, avatar upload) and `test-plan.md` (coverage for the above).

## D8 — Square images + group co-op mode (migrations 13–14)

**Square images.** A challenge may carry an optional `image_path` (public
`group-images` bucket, `{groupId}/challenges/...`; migration-06 storage RLS
already governs it). `challenges.text` becomes nullable with a
`text is not null OR image_path is not null` check, so a square can be text-only,
image-only, or text-over-image (rendered with a legibility scrim).

**Group co-op ("group bingo").** A card is authored as `game_mode` `individual`
(default) or `coop`. A co-op card is always an *identical* layout won by
*blackout*: the whole group shares ONE board (`coop_boards`, one per card) whose
squares (`coop_board_cells`) any member may mark. `marked_by` records who claimed
each square — this is both griefing protection (RLS: you may mark an unclaimed
cell, but only the marker may unmark their own) and the source of a
**contributions leaderboard** (rank by squares → points → earliest mark). Blackout
is detected by a trigger that sets/clears `coop_boards.completed_at` (revocable,
per D4). The board is created + seeded lazily and idempotently by the
`get_or_create_coop_board` SECURITY DEFINER RPC; structural card edits call
`rebuild_coop_board` (analogous to `rebuild_player_cards`, D5).

**Why:** Deliberately kept SEPARATE from the individual-play tables so
`player_cards` / `player_card_cells` / `check_bingo` / the `leaderboard` view are
untouched. In-place challenge-text edits keep `challenge_id`, so co-op marks
persist across text edits (only structural changes rebuild the board).

**Affects:** `data-model.md` (enum `card_game_mode`, tables `coop_boards`,
`coop_board_cells`, `challenges.image_path`), `api-endpoints.md`
(`uploadChallengeImage`, `getOrCreateCoopBoard`, `markCoopCell`,
`getCoopStandings`/`getCoopProgress`, coop realtime), and the card editor.

## Still open (minor, non-contract)
- Exact `join_code` format/length. Proposed default: **6 chars, uppercase A–Z + 2–9**
  (excluding ambiguous `0/O/1/I/L`), retry on collision.
- Anonymous/duplicate-account prevention remains **out of scope** (trust-based).

New decisions get appended here as D7, D8, …
