-- Let group members VIEW each other's boards (read-only) so tapping a player on
-- the leaderboard reveals their bingo card and which squares they've marked.
--
-- Previously `player_card_cells` SELECT was strictly the owner. We widen it to any
-- member of the group that owns the parent card. Writes (insert/update/delete)
-- stay owner-only, so this only exposes read visibility — no IDOR on marking.

drop policy pcc_select on public.player_card_cells;

create policy pcc_select on public.player_card_cells for select to authenticated
using (exists (
  select 1
  from public.player_cards pc
  join public.cards c on c.id = pc.card_id
  where pc.id = player_card_cells.player_card_id
    and private.is_group_member(c.group_id, (select auth.uid()))
));
