-- ============================================================
-- 15: harden co-op functions + cover FKs (advisor follow-up to 14)
-- ============================================================
-- Migration 14's functions were left with the default PUBLIC EXECUTE grant.
-- Match the rest of the codebase: internal trigger/helpers are callable by
-- no API role, and the client RPCs are authenticated-only (never anon).

-- Internal only (invoked by the trigger / via PERFORM) — like check_bingo,
-- on_cell_marked, _sync_bingo in migration 02.
revoke all on function public.check_coop_blackout(uuid) from public, anon, authenticated;
revoke all on function public.on_coop_cell_marked()     from public, anon, authenticated;

-- Client RPCs — authenticated-only, like create_group / publish_card.
revoke all on function public.get_or_create_coop_board(uuid) from public, anon;
revoke all on function public.rebuild_coop_board(uuid)       from public, anon;
grant execute on function public.get_or_create_coop_board(uuid) to authenticated;
grant execute on function public.rebuild_coop_board(uuid)       to authenticated;

-- Cover the two foreign keys flagged by the performance advisor.
create index if not exists coop_board_cells_challenge_idx on public.coop_board_cells (challenge_id);
create index if not exists coop_boards_group_idx on public.coop_boards (group_id);
