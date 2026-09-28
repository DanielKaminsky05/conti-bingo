-- ===== Enable RLS everywhere =====
alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.invites           enable row level security;
alter table public.cards             enable row level security;
alter table public.challenges        enable row level security;
alter table public.player_cards      enable row level security;
alter table public.player_card_cells enable row level security;
alter table public.bingos            enable row level security;
alter table public.notifications     enable row level security;

-- ===== profiles =====
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.group_members m1
    join public.group_members m2 on m1.group_id = m2.group_id
    where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ===== groups =====
create policy groups_select on public.groups for select to authenticated
using (public.is_group_member(id, (select auth.uid())));
create policy groups_insert on public.groups for insert to authenticated
with check (host_id = (select auth.uid()));
create policy groups_update on public.groups for update to authenticated
using (public.is_group_admin(id, (select auth.uid())))
with check (public.is_group_admin(id, (select auth.uid())));
create policy groups_delete on public.groups for delete to authenticated
using (public.is_group_owner(id, (select auth.uid())));

-- ===== group_members (inserts happen only via SECURITY DEFINER RPCs) =====
create policy gm_select on public.group_members for select to authenticated
using (public.is_group_member(group_id, (select auth.uid())));
create policy gm_update on public.group_members for update to authenticated
using (public.is_group_owner(group_id, (select auth.uid())))
with check (public.is_group_owner(group_id, (select auth.uid())) and role in ('admin','member'));
create policy gm_delete on public.group_members for delete to authenticated
using (
  (user_id = (select auth.uid()) and role <> 'owner')
  or (public.is_group_admin(group_id, (select auth.uid())) and role = 'member')
  or (public.is_group_owner(group_id, (select auth.uid())) and role = 'admin')
);

-- ===== invites (admins manage; accept/preview via RPC) =====
create policy invites_admin_all on public.invites for all to authenticated
using (public.is_group_admin(group_id, (select auth.uid())))
with check (public.is_group_admin(group_id, (select auth.uid())));

-- ===== cards =====
create policy cards_select on public.cards for select to authenticated
using (
  public.is_group_member(group_id, (select auth.uid()))
  and (status <> 'draft' or public.is_group_admin(group_id, (select auth.uid())))
);
create policy cards_write on public.cards for all to authenticated
using (public.is_group_admin(group_id, (select auth.uid())))
with check (public.is_group_admin(group_id, (select auth.uid())));

-- ===== challenges =====
create policy challenges_select on public.challenges for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id
    and public.is_group_member(c.group_id, (select auth.uid()))
    and (c.status <> 'draft' or public.is_group_admin(c.group_id, (select auth.uid())))
));
create policy challenges_write on public.challenges for all to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and public.is_group_admin(c.group_id, (select auth.uid()))
))
with check (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and public.is_group_admin(c.group_id, (select auth.uid()))
));

-- ===== player_cards (own writes; group members read for the leaderboard) =====
create policy pc_select on public.player_cards for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = player_cards.card_id and public.is_group_member(c.group_id, (select auth.uid()))
));
create policy pc_insert on public.player_cards for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.cards c
    where c.id = player_cards.card_id and public.is_group_member(c.group_id, (select auth.uid()))
  )
);

-- ===== player_card_cells (strictly the owner) =====
create policy pcc_select on public.player_card_cells for select to authenticated
using (exists (
  select 1 from public.player_cards pc
  where pc.id = player_card_cells.player_card_id and pc.user_id = (select auth.uid())
));
create policy pcc_insert on public.player_card_cells for insert to authenticated
with check (exists (
  select 1 from public.player_cards pc
  where pc.id = player_card_cells.player_card_id and pc.user_id = (select auth.uid())
));
create policy pcc_update on public.player_card_cells for update to authenticated
using (exists (
  select 1 from public.player_cards pc
  where pc.id = player_card_cells.player_card_id and pc.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.player_cards pc
  where pc.id = player_card_cells.player_card_id and pc.user_id = (select auth.uid())
));
create policy pcc_delete on public.player_card_cells for delete to authenticated
using (exists (
  select 1 from public.player_cards pc
  where pc.id = player_card_cells.player_card_id and pc.user_id = (select auth.uid())
));

-- ===== bingos (read-only for members; written only by the trigger) =====
create policy bingos_select on public.bingos for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = bingos.card_id and public.is_group_member(c.group_id, (select auth.uid()))
));

-- ===== notifications (recipient only; inserted server-side) =====
create policy notif_select on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===== Data API grants (RLS still governs rows). Writes go via Server Actions/RPCs. =====
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.groups            to authenticated;
grant select, update, delete         on public.group_members     to authenticated; -- insert via RPC
grant select, insert, update         on public.invites           to authenticated;
grant select, insert, update, delete on public.cards             to authenticated;
grant select, insert, update, delete on public.challenges        to authenticated;
grant select, insert                 on public.player_cards      to authenticated;
grant select, insert, update, delete on public.player_card_cells to authenticated;
grant select                         on public.bingos            to authenticated;
grant select, update                 on public.notifications     to authenticated;
