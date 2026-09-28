# Frontend Conventions (for agents)

Project: **conti-bingo** — Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui
(**Base UI** variant). Read with `frontend-plan.md` (pages/endpoints) and `api-endpoints.md`.

## Where things live
- Routes: `app/(app)/…` (authenticated shell already built) and `app/(auth)/…` (public).
- The group shell `app/(app)/groups/[id]/layout.tsx` (header + role-gated nav) ALREADY EXISTS.
  Your `groups/[id]/…` pages render inside it — do NOT recreate that layout.
- UI primitives: `@/components/ui/*` (button, dialog, dropdown-menu, sonner, input, label,
  card, avatar, badge, skeleton, tabs). Add more with `npx shadcn@latest add <name>` ONLY if
  needed (button/dialog/etc. already present).
- Shared: `@/components/common/submit-button` (`<SubmitButton pending>`),
  `@/components/common/empty-state` (`<EmptyState title description action icon>`).
- Helpers: `@/lib/utils` → `cn`; `@/lib/storage-url` → `publicStorageUrl(bucket, path)`;
  `@/lib/auth/current-user` → `getCurrentUser()`, `getCurrentProfile()`;
  `@/lib/queries/membership` → `getMyRole(groupId)`, `isHost(role)`.

## Component API notes (Base UI — important!)
- Base UI composes via a **`render` prop**, NOT `asChild`. To render a Button as a link:
  either `<Button render={<Link href="…" />}>Label</Button>` OR style a Link with
  `buttonVariants`: `import { buttonVariants } from "@/components/ui/button"` →
  `<Link className={cn(buttonVariants({ variant, size }))}>`.
- `DropdownMenuItem` supports `onClick`; for navigation use `onClick={() => router.push("…")}`.
- Dialog: `Dialog` / `DialogTrigger` / `DialogContent` / `DialogHeader` / `DialogTitle` /
  `DialogDescription` / `DialogFooter` / `DialogClose`. Trigger accepts `render={<Button/>}`.
- `cn` is exported from both `"cn"` and `@/lib/utils` — use `@/lib/utils`.

## Data + mutations
- **Reads** in Server Components: call `@/lib/queries/*` directly (they use the server client;
  they THROW on failure — wrap a page section in try/catch or let `not-found`/error boundary
  handle it). Membership/role via `getMyRole`.
- **Mutations** are Server Actions in `@/lib/actions/*`. They return
  `ActionResult<T> = { ok: true; data: T } | { ok: false; code; error }` (they do NOT throw for
  expected failures, and they do NOT redirect). Call them from **client components**:
  ```tsx
  "use client"
  const [pending, start] = useTransition()
  start(async () => {
    const res = await createGroup({ name })
    if (!res.ok) { toast.error(res.error); return }
    router.push(`/groups/${res.data.id}`); router.refresh()
  })
  ```
  Use `sonner`'s `toast` for feedback, `SubmitButton pending={pending}` for buttons.
- **FormData actions**: `uploadAvatar(formData)` and `uploadGroupImage(formData)` take a
  `FormData` (append `file`, and for group image `groupId`).
- After a mutation that changes server-rendered data, call `router.refresh()`.

## Endpoint signatures (import from these paths)
Actions `@/lib/actions/…`:
- `auth`: `signIn`, `signUp`, `signOut`, `resendConfirmation`
- `profile`: `updateProfile({username,name})`, `uploadAvatar(FormData)`, `removeAvatar()`
- `groups`: `createGroup({name,description?})`, `updateGroup({groupId,name?,description?,joinLocked?})`,
  `deleteGroup({groupId})`, `archiveGroup({groupId,archived})`, `joinGroup({joinCode})`,
  `leaveGroup({groupId})`, `removeMember({groupId,userId})`, `regenerateJoinCode({groupId})`,
  `updateMemberRole({groupId,userId,role:'admin'|'member'})`, `uploadGroupImage(FormData)`,
  `transferOwnership({groupId,newOwnerId})`
- `invites`: `createInvite({groupId,email?,role,expiresInHours?})`, `revokeInvite({inviteId})`, `acceptInvite({token})`
- `cards`: `createCard({groupId,title,description?,gridSize,layoutMode,freeSpace,winCondition,startsAt?,endsAt?,challenges:[{text,points?}]})`,
  `updateCard({cardId,…})`, `publishCard({cardId})`, `replaceActiveCard({…same as createCard})`
- `play`: `getOrCreatePlayerCard({cardId})`, `markCell({playerCardId,position,marked})`
- `notifications`: `markNotificationRead({id?})` (omit id = mark all)

Queries `@/lib/queries/…`:
- `profile.getProfile(userId?)`, `groups.getGroup(id)`, `groups.listMyGroups()`, `groups.listMembers(id)`,
  `invites.listInvites(groupId)`, `invites.getInviteByToken(token)`,
  `cards.getActiveCard(groupId)`, `cards.listArchivedCards(groupId)`, `cards.getCard(cardId)`, `cards.listDraftCards(groupId)`,
  `play.getPlayerCard(playerCardId)`, `leaderboard.getLeaderboard(cardId)`, `notifications.listNotifications({limit?,unreadOnly?})`

Realtime (client) `@/lib/realtime/…` with the browser client `@/lib/supabase/client` `createClient()`:
- `subscriptions.subscribeToBingos(client, cardId, onChange)`, `subscriptions.subscribeToPlayerCells(client, playerCardId, onChange)`
- `notifications.subscribeToNotifications(client, userId, onChange)`

Types: `@/lib/supabase/database.types` → `Tables<'x'>`, `Enums<'x'>`.

## Aesthetic (Wordle-inspired) — see `frontend-plan.md` §9
- Soft, mobile-first, rounded. Use theme classes: `bg-background`, `bg-card`, `text-muted-foreground`,
  `border`, `bg-primary` (green), plus bespoke tiles: `bg-marked text-marked-foreground`,
  `bg-free text-free-foreground`, `text-gold`, `border-tile-border`.
- Bingo tiles: `aspect-square rounded-xl`, ≥44px, wrapped small bold text, pop-and-fill on mark.
- Respect `prefers-reduced-motion`. Support dark mode (tokens already defined).

## Rules
- Create ONLY the files for your phase (listed in your prompt). Do NOT modify the shared
  foundation, other phases' files, `package.json`, or the group `[id]/layout.tsx`.
- Server Components by default; add `"use client"` only for interactive islands.
- `params`/`searchParams` are Promises in Next 16 — `await` them.
- Do NOT run the full build (other phases may be mid-flight). Keep code type-correct.
