-- ============================================================
-- 18: class (co-op) board — any member may mark again
-- ============================================================
-- Reverses migration 16's host-only restriction. Now ANY group member may mark
-- an unclaimed square and unmark their own (marker-lock prevents un-marking
-- someone else's). Hosts (owner/admin) keep full control — they may unmark any
-- square. `marked_by` still records who marked each square (contributions).

drop policy if exists coop_cells_update on public.coop_board_cells;

create policy coop_cells_update on public.coop_board_cells for update to authenticated
using (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_member(b.group_id, (select auth.uid()))
  )
  and (
    marked_by is null                              -- unclaimed: any member may mark
    or marked_by = (select auth.uid())             -- own square: may unmark
    or exists (                                     -- host: may touch any square
      select 1 from public.coop_boards b
      where b.id = coop_board_cells.board_id
        and private.is_group_admin(b.group_id, (select auth.uid()))
    )
  )
)
with check (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_member(b.group_id, (select auth.uid()))
  )
  and (
    (is_marked and marked_by = (select auth.uid()))  -- marking credits you
    or (not is_marked and marked_by is null)         -- unmarking clears the marker
  )
);
