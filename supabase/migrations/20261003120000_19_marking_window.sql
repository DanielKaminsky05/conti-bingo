-- ============================================================
-- 19: lock marking once a card's end time has passed
-- ============================================================
-- After cards.ends_at, regular players can no longer mark/unmark squares.
-- Hosts (owner/admin) stay exempt so they can finish up before archiving.
-- Cards with no ends_at are unaffected. now() is the authoritative server time.

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
        c.ends_at is null
        or c.ends_at > now()
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
        c.ends_at is null
        or c.ends_at > now()
        or private.is_group_admin(c.group_id, (select auth.uid()))
      )
  )
);

-- ----- Class (co-op) board -----
-- Hosts: any square, any time. Members: unclaimed or their own, and only while
-- the card is still open (migration 18 rule + the end-time gate).
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
