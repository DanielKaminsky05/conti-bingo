# Conti-Bingo — Frontend Plan

**Status:** Draft v0.1 · **Last updated:** 2026-09-28
**Relates to:** [`requirements.md`](./requirements.md), [`api-endpoints.md`](./api-endpoints.md), [`data-model.md`](./data-model.md), [`best-practices.md`](./best-practices.md), [`decisions.md`](./decisions.md)

Endpoint references (e.g. **G3**, **C1**, **P3**) map to `api-endpoints.md`. Mutations are
Server Actions in `lib/actions/*`; reads are Server-Component queries in `lib/queries/*`;
realtime helpers are in `lib/realtime/*`.

---

## 1. Conventions
- **Mobile-first.** Players mark squares on phones during class; the bingo grid and
  leaderboard are the hero surfaces. Desktop is a widened version of the same.
- **Server Components by default**; add `'use client'` only for interactive islands
  (grid cells, leaderboard subscriber, toasts, forms, dialogs).
- **Data fetching in Server Components** (call `lib/queries/*` directly). **Mutations via
  Server Actions** (`useActionState`/`useTransition` for pending + optimistic UI).
- **Auth gating**: `proxy.ts` refreshes the session and bounces unauthenticated users from
  `(app)` routes to `/login`; each Server Action still re-checks `getUser()` + RLS.
- **Roles are per-group** (owner / admin / member). "Host controls" = owner **or** admin.
  The UI hides host-only controls; RLS is the real guard.
- **Realtime**: subscribe on the client to the group's `bingos` (alerts + leaderboard) and
  the user's `notifications` (badge). RLS filters what each client receives.
- **States**: every data surface defines **loading** (skeleton), **empty**, and **error**.

---

## 2. Route Map
```
app/
  (auth)/                         # public; redirect to / if already signed in
    login/                        # sign in
    signup/                       # create account
    confirm-email/                # "check your inbox" + resend
  auth/callback/route.ts          # email-confirm handler (built: A6)

  (app)/                          # authenticated; shared header + nav
    page.tsx                      # "/"  Dashboard — my groups
    profile/                      # profile + avatar
    notifications/                # notification center
    join/[code]/                  # join via shared code/link
    invite/[token]/               # accept an emailed invite
    groups/[id]/
      page.tsx                    # group hub (Play)
      leaderboard/                # full leaderboard
      members/                    # roster, roles, invites (host)
      cards/                      # card history + drafts
      cards/new/                  # author a card (host)
      cards/[cardId]/             # view / edit / publish a card
      settings/                   # group settings (host)

  api/health/route.ts             # liveness (built: O1)
```

---

## 3. Global Shell (`(app)/layout.tsx`)
- **Header**: logo → `/`; **NotificationBell** (unread count, realtime **N3**, links to
  `/notifications`); **profile menu** (avatar → `/profile`, **Sign out** → `signOut` **A3**).
- **Mobile bottom nav** (when inside a group): Play · Leaderboard · Members · More.
- **Toast host**: renders "first to bingo" alerts (**L2**) and action feedback.
- Reads the current user + profile once (server) for the header; passes to a small client
  provider for realtime.

---

## 4. Pages

### 4.1 `/login` — Sign in
| | |
|---|---|
| **Access** | Public (redirects to `/` if signed in) |
| **Purpose** | Email + password sign-in |
| **Writes** | **A2** `signIn` |
| **UI** | Email + password fields; submit; inline error (invalid creds / `email_not_confirmed` → link to resend); links to `/signup` |
| **States** | Pending spinner on submit; error banner |

### 4.2 `/signup` — Create account
| | |
|---|---|
| **Access** | Public |
| **Purpose** | Register (email, name, password) |
| **Writes** | **A1** `signUp` |
| **UI** | Name, email, password (+ strength hint); submit; on success → `/confirm-email` |
| **Notes** | Email confirmation required (D3); no 2FA |

### 4.3 `/confirm-email` — Check your inbox
| | |
|---|---|
| **Access** | Public |
| **Purpose** | Tell the user to confirm; allow resend |
| **Writes** | **A4** `resendConfirmation` |
| **UI** | Instructions; "Resend email" button (rate-limit friendly); link back to `/login` |

### 4.4 `/` — Dashboard (My Groups)
| | |
|---|---|
| **Access** | Auth |
| **Purpose** | Landing hub: the groups you own or belong to |
| **Reads** | **G3** `listMyGroups` |
| **Writes** | **G1** `createGroup` (dialog), **G6** `joinGroup` (dialog) |
| **UI** | Grid/list of **GroupCard** (name, image, your role badge, active-card status, your bingo/mark count); **"Create group"** and **"Join with code"** buttons; **EmptyState** for new users |
| **States** | Skeleton cards; empty ("You're not in any groups yet"); error retry |

### 4.5 `/profile` — Profile settings
| | |
|---|---|
| **Access** | Auth |
| **Purpose** | Edit identity + avatar |
| **Reads** | **U1** `getProfile` |
| **Writes** | **U2** `updateProfile` (username, name), **U3** `uploadAvatar`, **U4** `removeAvatar` |
| **UI** | **AvatarUploader** (preview, crop-optional, remove); username (uniqueness error inline), display name; save; sign out |
| **States** | Pending save; "username taken" (conflict); upload progress/size errors |

### 4.6 `/notifications` — Notification center
| | |
|---|---|
| **Access** | Auth |
| **Purpose** | List + read notifications |
| **Reads** | **N1** `listNotifications` (paged, unread-first) |
| **Writes** | **N2** `markNotificationRead` (one / all) |
| **Realtime** | **N3** live prepend + badge update |
| **UI** | List of typed items (member joined, out-bingo'd, card published, invite) with relative time + deep link; "Mark all read"; **EmptyState** |

### 4.7 `/join/[code]` — Join via code/link
| | |
|---|---|
| **Access** | Auth (redirect to `/login?next=` if not) |
| **Purpose** | One-tap join from a shared link |
| **Writes** | **G6** `joinGroup` |
| **UI** | Minimal confirm ("Join Section 5?") → on success redirect to `/groups/[id]`; errors: invalid code / joining disabled |

### 4.8 `/invite/[token]` — Accept invite
| | |
|---|---|
| **Access** | Public preview; sign-in required to accept |
| **Purpose** | Preview an emailed invite and accept it |
| **Reads** | **V4** `getInviteByToken` (group name/image, role, validity) |
| **Writes** | **V5** `acceptInvite` |
| **UI** | Group preview card + role ("You'll join as co-host"); **Accept** (prompts sign-in/up first if needed); errors: expired / revoked / invalid |

### 4.9 `/groups/[id]` — Group hub (Play)
The primary player surface. Tabs/bottom-nav to Leaderboard / Members / Cards.
| | |
|---|---|
| **Access** | Member (RLS); non-members blocked |
| **Purpose** | Play the active card; see your progress + a leaderboard peek |
| **Reads** | **G2** `getGroup`, **C2** `getActiveCard`, **P2** `getPlayerCard`, **L1** `leaderboard` (top N preview) |
| **Writes** | **P1** `getOrCreatePlayerCard` (on first visit / on demand), **P3** `markCell` |
| **Realtime** | **L2** bingo alerts (toast + confetti), **L3** own-cell sync |
| **UI** | **BingoGrid** (tap to mark; free-space pre-marked; win animation), your progress (marks/points, "N to a line"), leaderboard preview, share **join code**; host sees a "Manage" affordance |
| **Empty** | No active card yet → members see "Waiting for a card"; host sees "Create a card" CTA |
| **States** | Optimistic mark toggle (revert on error); "revoked" when a win is undone (D4) |

### 4.10 `/groups/[id]/leaderboard` — Full leaderboard
| | |
|---|---|
| **Access** | Member |
| **Purpose** | Full standings for the active card |
| **Reads** | **L1** `leaderboard` (ranked by bingos → points → squares → first-bingo) |
| **Realtime** | **L2** live re-rank on bingo insert/revoke |
| **UI** | **Leaderboard** rows (rank, avatar, name, bingos, points, squares; "you" highlighted); toggle to a past card's final standings |

### 4.11 `/groups/[id]/members` — Roster, roles & invites (host)
| | |
|---|---|
| **Access** | Member reads roster; **owner/admin** manage |
| **Purpose** | Manage membership + invites + join code |
| **Reads** | **G8** `listMembers`, **V2** `listInvites` (host) |
| **Writes** | **G11** `updateMemberRole`, **G9** `removeMember`, **V1** `createInvite`, **V3** `revokeInvite`, **G10** `regenerateJoinCode`, `transferOwnership`, **G7** `leaveGroup` |
| **UI** | **MemberList** (avatar, name, role menu — promote/demote/remove; owner badge); **InvitePanel** (email invite + shareable link, pending list with revoke); **ShareJoinCode** (copy/QR, rotate); "Leave group" (owner must transfer first); "Transfer ownership" (owner) |
| **States** | Owner-only vs admin-only affordances; confirm dialogs for remove/transfer |

### 4.12 `/groups/[id]/cards` — Card history
| | |
|---|---|
| **Access** | Member (drafts only visible to host) |
| **Purpose** | Browse active, drafts, and archived cards |
| **Reads** | **C2** `getActiveCard`, **C8** `listDraftCards` (host), **C5** `listArchivedCards` |
| **Writes** | **C7** `publishCard` (host), **C4** `replaceActiveCard` (host) |
| **UI** | Sections: **Active** (with "Replace"), **Drafts** (host: edit/publish), **Archived** (view + final leaderboard); host CTA **"New card"** → `cards/new` |

### 4.13 `/groups/[id]/cards/new` — Author a card (host)
| | |
|---|---|
| **Access** | **owner/admin** |
| **Purpose** | Create a draft card |
| **Writes** | **C1** `createCard` (then optionally **C7** `publishCard`) |
| **UI** | **CardEditor**: title/description; grid size (4/5/6, 5 default); layout mode (shuffled/identical); free-space toggle (odd grids only — auto-disabled on 4×4/6×6); win condition (line/blackout); optional schedule (start/end); **challenge list** (add/reorder/remove, per-challenge points); live "need N challenges" counter; **Save draft** / **Save & publish** |
| **States** | Inline validation mirroring the Zod rules (count fits grid, points>0, free-space odd-only, end>start) |

### 4.14 `/groups/[id]/cards/[cardId]` — View / edit / publish a card
| | |
|---|---|
| **Access** | Member (view non-draft); **owner/admin** (edit/publish) |
| **Purpose** | Inspect a card; host edits/publishes |
| **Reads** | **C6** `getCard` |
| **Writes** | **C3** `updateCard`, **C7** `publishCard`, **C4** `replaceActiveCard` |
| **UI** | Read view (config + challenges + who's playing); host **CardEditor** in edit mode; **warning** when a structural edit (grid/layout/free-space or add/remove challenge) will rebuild player cards & reset marks; a single challenge text edit only un-completes that square (D5) |

### 4.15 `/groups/[id]/settings` — Group settings (host)
| | |
|---|---|
| **Access** | **owner/admin** (delete/archive: **owner**) |
| **Purpose** | Edit group; lifecycle |
| **Reads** | **G2** `getGroup` |
| **Writes** | **G4** `updateGroup` (name/description/join-lock), **G13** `uploadGroupImage`, **G12** `archiveGroup`, **G5** `deleteGroup` (owner) |
| **UI** | Group name/description; image uploader; **join lock** toggle; **Archive** (soft) / **Delete** (owner, destructive, confirm-by-typing) |

---

## 5. Reusable Components
| Component | Client? | Used by | Notes |
|---|---|---|---|
| `AppHeader` / `BottomNav` | mixed | shell | nav + profile menu |
| `NotificationBell` | client | shell | realtime **N3**, unread badge |
| `ToastHost` / `BingoAlert` | client | shell | **L2** alerts + confetti |
| `GroupCard` | server | dashboard | role badge, active-card status |
| `CreateGroupDialog` / `JoinGroupDialog` | client | dashboard | **G1** / **G6** |
| `BingoGrid` + `BingoCell` | client | group hub | tap-to-mark, optimistic, free space |
| `Leaderboard` + `LeaderboardRow` | client | hub, leaderboard | realtime re-rank |
| `MemberList` + `MemberRow` | client | members | role menu, remove |
| `InvitePanel` + `InviteDialog` | client | members | **V1/V2/V3** |
| `ShareJoinCode` | client | members, hub | copy / QR / rotate |
| `CardEditor` | client | cards/new, card edit | challenges, config, validation |
| `CardListItem` | server | cards | status pill |
| `ProfileForm` + `AvatarUploader` | client | profile | **U2/U3/U4** |
| `ConfirmDialog`, `EmptyState`, `Skeletons`, `ErrorState` | mixed | everywhere | consistent states |

---

## 6. Realtime Subscriptions
| Surface | Channel | Source |
|---|---|---|
| Bingo alerts + leaderboard re-rank | `bingos` filtered by `card_id` | **L2** (`lib/realtime/subscriptions.ts`) |
| Own live progress | `player_card_cells` filtered by `player_card_id` | **L3** |
| Notification badge/center | `notifications` filtered by `user_id` | **N3** (`lib/realtime/notifications.ts`) |

Subscribe in client components mounted on the relevant page; unsubscribe on unmount. RLS
governs delivery.

---

## 7. Role-Based UI Visibility
| Control | member | admin (co-host) | owner |
|---|---|---|---|
| Play card, view leaderboard/members, receive notifications | ✓ | ✓ | ✓ |
| Author / edit / publish / replace cards | — | ✓ | ✓ |
| Invite, manage roster, rotate join code, edit group | — | ✓ | ✓ |
| Promote/demote roles | — | — | ✓ |
| Archive / delete group, transfer ownership | — | — | ✓ |

(UI hides what a role can't do; RLS enforces it regardless.)

---

## 8. Suggested Build Order
1. **Shell + auth** — `(app)/layout`, header, `proxy.ts` gating; `/login`, `/signup`,
   `/confirm-email` (A1/A2/A4). 
2. **Dashboard + groups** — `/` with create/join (G1/G3/G6); `/join/[code]`.
3. **Play loop (core)** — `/groups/[id]` hub: `BingoGrid` + `getOrCreatePlayerCard`/`markCell`
   (P1/P3), plus `/groups/[id]/leaderboard` (L1) and realtime (L2/L3). This is the product.
4. **Card authoring** — `/groups/[id]/cards`, `cards/new`, `cards/[cardId]` (C1–C8).
5. **Members & invites** — `/groups/[id]/members` (G8–G11, V1–V5, transfer).
6. **Profile + notifications** — `/profile` (U1–U4), `/notifications` (N1–N3), `/invite/[token]` (V4/V5).
7. **Settings + polish** — `/groups/[id]/settings` (G4/G5/G12/G13); empty/error states, animations.

---

## 9. UI / Design System (Wordle-inspired)

**Feel:** soft, calm, tactile. Light warm background, bold rounded tiles, generous
whitespace, big tap targets, and small satisfying animations. Playful but uncluttered.

### Component strategy (decided)
- **shadcn/ui + Tailwind** for primitives: `Dialog`, `DropdownMenu`, `Tabs`, `Popover`,
  `Sonner` (toasts), `Input`/`Label`/`Button`/`Form`, `Avatar`, `Badge`, `Card`, `Skeleton`,
  `Tooltip`. Accessible (Radix), copied into the repo, restyled to our theme.
- **Hand-rolled Tailwind** for the bespoke game pieces: `BingoGrid`/`BingoCell`,
  `Leaderboard` rows, and the win animations.
- Verify at setup: `npx shadcn@latest init` on **Tailwind v4 + React 19 + Next 16** (may need
  a peer-deps flag); fallback is hand-rolled primitives.

### Palette (design tokens → CSS variables in `globals.css` via Tailwind v4 `@theme`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF8` (soft off-white) | `#121213` | app background |
| `--surface` | `#FFFFFF` | `#1E1E20` | cards, sheets |
| `--text` | `#1A1A1B` | `#F5F5F5` | primary text |
| `--muted` | `#787C7E` | `#9A9A9C` | secondary text |
| `--tile-border` | `#D3D6DA` | `#3A3A3C` | unmarked tile |
| `--marked` | `#6AAA64` (Wordle green) | `#538D4E` | marked / completed tile |
| `--accent` | `#C9B458` (Wordle gold) | `#B59F3B` | points, line highlight |
| `--free` | `#EDEDED` / text muted | `#2C2C2E` | free-space tile |
| `--danger` | `#D64545` | `#E06666` | destructive actions |

### Bingo tiles (the hero)
- **Shape:** `aspect-square`, `rounded-xl` (soft, not sharp), ≥ 44px tap target, `gap-1.5`–`gap-2` grid.
- **Text:** phrase, centered, wrapped, `text-xs`–`text-sm` bold, `line-clamp-3`; not uppercased
  (readability over Wordle's single-letter caps).
- **States:** *unmarked* = white/surface + `--tile-border`, dark text · *marked* = `--marked`
  fill + white text + subtle check · *free space* = `--free`, muted, small ★, pre-marked ·
  *part of a completed line* = green glow / ring.
- **Interactions:** tap → scale `0.96` spring; mark → **pop-and-fill** (scale 1→1.06→1 + bg
  color transition, ~180ms); completed line → staggered bounce + **confetti** + toast (**L2**);
  revoke (D4) → reverse fill. Honor `prefers-reduced-motion` (fall back to instant color change).

### Typography & shape
- Font: **Geist** (already installed) — clean, slightly rounded; bold on tiles/headings.
- Cards/containers `rounded-2xl` with soft shadow; inputs `rounded-lg`.
- Dark mode supported from day one via the token set above.

### Motion inventory
tap-scale · pop-and-fill (mark) · line bounce + confetti (bingo) · toast slide-in · skeleton
shimmer. Keep it subtle; everything degrades gracefully with reduced motion.

---

## 10. Open Questions
- **Navigation inside a group**: tabs on the hub vs. separate routes (this doc assumes
  routes + a bottom-nav on mobile).
- **Play surface**: is the grid the group hub itself (assumed) or a dedicated `/play`?
- **Invite delivery**: send real invite emails now (needs SMTP) or share links only for v1?
- ~~**Notifications breadth**~~ — resolved: all six types are produced by triggers
  (migration 21); the header bell shows a live unread badge.
