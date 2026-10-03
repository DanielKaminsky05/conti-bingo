-- ============================================================
-- 20: also lock marking BEFORE a card's start time
-- ============================================================
-- Extends migration 19's end gate into a full window: regular players can only
-- mark/unmark while starts_at <= now() < ends_at (null bounds = open-ended).
-- Hosts (owner/admin) stay exempt. now() is authoritative server time.

-- ----- Individual boards -----
drop policy if exists pcc_update on public.player_card_cells;
create policy pcc_update on public.player_card_cells for update to authenticated
using (
  exists (
    select 1
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.id = player_card_cells.player_card_id
      and pc.user_id = (select auth.uid())
      and (
        (
          (c.starts_at is null or c.starts_at <= now())
          and (c.ends_at is null or c.ends_at > now())
        )
        or private.is_group_admin(c.group_id, (select auth.uid()))
      )
  )
)
with check (
  exists (
    select 1
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.id = player_card_cells.player_card_id
      and pc.user_id = (select auth.uid())
      and (
        (
          (c.starts_at is null or c.starts_at <= now())
          and (c.ends_at is null or c.ends_at > now())
        )
        or private.is_group_admin(c.group_id, (select auth.uid()))
      )
  )
);

-- ----- Class (co-op) board -----
drop policy if exists coop_cells_update on public.coop_board_cells;
create policy coop_cells_update on public.coop_board_cells for update to authenticated
using (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_member(b.group_id, (select auth.uid()))
  )
  and (
    exists (
      select 1 from public.coop_boards b
      where b.id = coop_board_cells.board_id
        and private.is_group_admin(b.group_id, (select auth.uid()))
    )
    or (
      exists (
        select 1 from public.coop_boards b
        join public.cards c on c.id = b.card_id
        where b.id = coop_board_cells.board_id
          and (c.starts_at is null or c.starts_at <= now())
          and (c.ends_at is null or c.ends_at > now())
      )
      and (marked_by is null or marked_by = (select auth.uid()))
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
    (is_marked and marked_by = (select auth.uid()))
    or (not is_marked and marked_by is null)
  )
);
