-- Leaderboard: derived from player_cards counters + profile display.
-- security_invoker => underlying player_cards RLS applies (group members see their group).
create view public.leaderboard
with (security_invoker = true) as
select
  pc.card_id,
  c.group_id,
  pc.user_id,
  p.username,
  p.name,
  p.avatar_path,
  pc.bingo_count,
  pc.points_total,
  pc.marks_count,
  pc.first_bingo_at
from public.player_cards pc
join public.cards c    on c.id = pc.card_id
join public.profiles p on p.id = pc.user_id;

grant select on public.leaderboard to authenticated;

comment on view public.leaderboard is
  'Per-player standings for a card. Rank by bingo_count desc, points_total desc, marks_count desc, first_bingo_at asc.';
