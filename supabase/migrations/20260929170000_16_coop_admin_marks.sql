-- ============================================================
-- 16: co-op marking is host-only (owner/admin)
-- ============================================================
-- Change of rule: on a shared co-op board, only group HOSTS (owner/admin) may
-- mark or unmark squares. Regular members still SELECT (watch the board fill
-- live) but can no longer write. Hosts are trusted, so the previous marker-lock
-- is dropped — any host may unmark any square. `marked_by` still records who
-- marked each square (contributions leaderboard); WITH CHECK keeps it accurate.

drop policy if exists coop_cells_update on public.coop_board_cells;

create policy coop_cells_update on public.coop_board_cells for update to authenticated
using (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_admin(b.group_id, (select auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_admin(b.group_id, (select auth.uid()))
  )
  and (
    (is_marked and marked_by = (select auth.uid()))
    or (not is_marked and marked_by is null)
  )
);
