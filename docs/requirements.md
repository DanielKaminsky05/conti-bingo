# Conti-Bingo — Requirements

**Status:** Draft v1.0 · **Last updated:** 2026-09-25

## 1. Overview
A web app for Ivey Business School sections to play "conti-bingo" — a participation
game where students complete cheeky challenges (e.g. "thank the prof for picking me")
while contributing in class. Participation is ~35% of the grade, so students contribute
constantly; conti-bingo makes it a game.

A section's **VP Academics** authors a bingo card, creates a group, and invites the
section. Each player tracks their own card, and the group competes via a leaderboard
and live "first to bingo" alerts.

This is an **unofficial, student-run tool** for a section to use among themselves — not
an official Ivey system.

## 2. Roles
Roles are **per group** (stored on membership), so one account can be an owner in one group
and a member in another.

| Role | Capabilities |
|------|-------------|
| **Owner** (VP Academics, group creator) | Everything an admin can do, plus manage co-hosts (promote/demote), delete/archive the group, and transfer ownership. Exactly one per group. |
| **Admin** (co-host) | Author/publish cards, invite people, manage the roster and join code, edit group details. Lets a VP share duties. |
| **Member** (section player) | Join a group, view their card, self-mark squares, see progress + leaderboard + alerts, receive notifications, browse past cards. |

Every user has a real account with a profile (username, display name, optional avatar) — see
Auth below. "Host" in this doc means **owner or admin**.

## 3. Core Objects
- **User / Profile** — email, name, password (email confirmed on sign-up), plus a unique
  **username** and an **optional avatar**. Can own/co-host groups and/or play in groups.
- **Group** — a section's space (name, optional description + image, members with roles,
  join code/link, join lock, active/archived status). A user can have multiple groups.
- **Invite** — an email/link invitation to a group with a role (member or co-host), a
  token, an expiry, and a status (pending/accepted/revoked/expired).
- **Card** — a set of challenges + config (grid size, layout mode, win condition, free
  space, optional schedule). Belongs to a group. Authored as a **draft**, then published;
  only **one card is active per group at a time**; previous cards are archived and viewable.
- **Challenge/Square** — a text prompt (e.g. "call the professor handsome") with an optional
  **point weight**.
- **Player Card** — a given player's instance of the active card, storing their square
  arrangement and which squares are marked.
- **Notification** — an in-app message to a user (someone joined, card published, you were
  out-bingo'd, an invite arrived), with a read/unread state.

## 4. User Stories

**Host (owner / admin co-host)**
- As a host, I can sign up (email, name, password), confirm my email, set up my profile
  (username, optional avatar), and create a group (with an optional image).
- As an owner, I can promote a member to **co-host (admin)** to share the work, and transfer
  ownership.
- As a host, I can author a card as a **draft**, set grid size (4×4/5×5/6×6, 5×5 default),
  layout mode, optional **point weights**, and an optional **schedule**, then **publish** it.
- As a host, I can invite my section by **sharing a join link/code** or **inviting specific
  emails**, and I can **lock joining** or rotate the code.
- As a host, I can replace the active card with a new one; the old one is archived.
- As a host, I can see the group leaderboard, bingo history, and past cards.

**Player (member)**
- As a player, I can sign up (email, name, password), confirm my email, set up my profile,
  and join a group **via a code/link or an emailed invite** to get my card.
- As a player, I can tap a square to mark it done, and untap to undo (honor system). Untapping
  a square that had completed a bingo revokes that bingo.
- As a player, I can see my progress toward a bingo.
- As a player, I get notified — and the group gets notified — when I or someone else
  hits a bingo, and I have an **in-app notification center** for group events.
- As a player, I can view the leaderboard (ranked by bingos, points, then squares) and browse
  previous cards.

## 5. Functional Requirements

### 5.1 Authentication
- All users create an account with **email, name, and password**.
- **Email confirmation** is required on sign-up (account unverified until the emailed link
  is confirmed). **No two-factor authentication.**
- Any email address is accepted (no Ivey-email restriction).

### 5.2 Groups & Membership
- A user can create one or more groups; the creator is the **owner**.
- Members are assigned a **role**: owner, admin (co-host), or member. Owners manage roles and
  can transfer ownership; owners/admins manage the roster, join code, group details, and
  can **archive** the group.
- People join via a **shareable code/link** (which the host can **lock**) or via an
  **email/link invitation** (with a role and expiry).

### 5.2a Profiles
- Each user has a unique **username**, a display **name**, and an **optional avatar** image.

### 5.2b Notifications
- Users have an **in-app notification center** for group events (member joined, card
  published/replaced, invite received, out-bingo'd), with unread state, updating in real time.

### 5.3 Card Authoring
- Host adds/edits/removes challenges (free text), each with an optional **point weight**
  (default 1) used for leaderboard scoring.
- Cards are authored as a **draft** and **published** when ready (publishing archives the
  current active card). A card may have an optional **schedule** (start/end).
- Host sets:
  - **Grid size** — customizable; **4×4, 5×5, 6×6** supported, **5×5 is the default/standard**.
  - **Layout mode** — *shuffled per player* or *identical for everyone*, chosen per card.
  - **Free space** toggle — **available only on 5×5** (odd grids); forced off on 4×4/6×6
    which have no center cell.
  - **Win condition** — see 5.5.
- The number of challenges must fit the grid (e.g. 5×5 = 25 squares, minus free space).
- **Editing anytime:** the host can edit a card (title, challenges, grid, layout) even after
  players have joined. Editing an **individual square** un-completes just that square on
  every player's card (and revokes any bingo that relied on it); other marks are preserved.
  Changing **grid size or layout mode** rebuilds players' cards and resets that card's marks
  (with a warning).

### 5.4 Card Rendering & Marking
- Each player sees their grid.
- In **shuffled** mode, each player gets a unique arrangement of the same challenge pool.
- In **identical** mode, all players see the same layout.
- Players **self-mark** squares (tap to toggle); state persists per player. Trust-based —
  no verification.

### 5.5 Win Detection
- The system detects a completed **line** (row / column / diagonal) and, as a bonus tier,
  a **full-card blackout**, per the card's win condition.
- **Default:** win = any completed line; blackout tracked as a bonus achievement.
- **Wins reflect current marks (revocable):** unmarking a square that had completed a bingo
  removes that bingo; re-completing it records it again.

### 5.6 Leaderboard
- Ranks players in the group by **bingos, then weighted points, then squares marked**
  (earliest first-bingo breaks ties).
- Updates live.

### 5.7 Real-Time Bingo Alerts
- When a player completes a bingo, the whole group is notified in real time
  ("first to bingo" moments).

### 5.8 Card History
- Only one active card per group at a time.
- Previous cards are **archived and viewable** by the group (including their final
  leaderboards / bingo history).

## 6. Non-Functional Requirements
- **Mobile-first** — players mark squares on their phones during class; must be fast and
  thumb-friendly.
- **Real-time** — leaderboard and bingo alerts update without a manual refresh.
- **Low-friction joining** — link/code → playing in seconds (after sign-up).
- **Lightweight & low-cost** — a section is ~70–80 students; scale is small.
- **Security** — passwords hashed (Supabase Auth), email confirmation on sign-up, standard
  account-security hygiene. RLS isolates every group's data.
- **Privacy** — unofficial tool; collect minimal data (email, name, gameplay state).

## 7. Out of Scope (v1)
- Verification / anti-cheat on self-marked squares (trust is fine).
- Official Ivey integration or grade syncing.
- Native mobile apps (web only, mobile-first).
- Cross-section / global leaderboards.
- **Activity feed and emoji reactions** — deferred (D7); notifications cover events for now.

## 8. Resolved Decisions
| Decision | Choice |
|----------|--------|
| Player identity / auth | Full accounts: email + name + password, **email confirmation, no 2FA**, any email (D3) |
| Grid size | Customizable (4×4 / 5×5 / 6×6), 5×5 standard |
| Card layout mode | Host chooses shuffled-per-player or identical, per card |
| Free space | **Only on 5×5** (odd grids); off for 4×4/6×6 (D6) |
| Marking / integrity | Honor system, self-mark, trust-based (no verification) |
| Wins | **Revocable** — reflect current marks; unmarking removes a bingo (D4) |
| Card editing | Host can edit **anytime**; per-square edits un-complete only that square (D5) |
| Cards per group | Authored as **draft**, then published; one active at a time; previous archived + viewable |
| Card scoring | Optional **weighted points** per challenge (D7) |
| Roles | Per-group **owner / admin (co-host) / member** (D7) |
| Invitations | Join code/link **and** email/token invites (D7) |
| Profiles | Username + display name + **optional avatar**; group image (D7) |
| Notifications | In-app notification center for group events (D7) |
| Social layer | Leaderboard (view) + real-time "first to bingo" alerts |
| Data access | Client reads via Data API (RLS); writes via Server Actions (D1/D2) |
| Official status | Unofficial, student-run, for the section's own use |

See [`decisions.md`](./decisions.md) for full rationale on each (D1–D7).

## 9. Open / Deferred
- **Win condition detail** — defaulted to "any line, blackout as bonus." Revisit if the
  host should be able to require blackout-only, multiple lines, etc.
- Notification channels beyond in-app (email/push) — not specified; in-app assumed for v1.
