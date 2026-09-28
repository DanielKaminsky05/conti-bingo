-- ===== Move RLS helper functions to a non-exposed schema =====
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_group_member(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members where group_id = p_group and user_id = p_user);
$$;
create or replace function private.is_group_admin(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members
                where group_id = p_group and user_id = p_user and role in ('owner','admin'));
$$;
create or replace function private.is_group_owner(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members
                where group_id = p_group and user_id = p_user and role = 'owner');
$$;
revoke all on function private.is_group_member(uuid, uuid) from public;
revoke all on function private.is_group_admin(uuid, uuid)  from public;
revoke all on function private.is_group_owner(uuid, uuid)  from public;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_group_admin(uuid, uuid)  to authenticated;
grant execute on function private.is_group_owner(uuid, uuid)  to authenticated;

-- ===== Recreate every policy that referenced the public helpers =====
-- groups
drop policy groups_select on public.groups;
drop policy groups_update on public.groups;
drop policy groups_delete on public.groups;
create policy groups_select on public.groups for select to authenticated
using (private.is_group_member(id, (select auth.uid())));
create policy groups_update on public.groups for update to authenticated
using (private.is_group_admin(id, (select auth.uid())))
with check (private.is_group_admin(id, (select auth.uid())));
create policy groups_delete on public.groups for delete to authenticated
using (private.is_group_owner(id, (select auth.uid())));

-- group_members
drop policy gm_select on public.group_members;
drop policy gm_update on public.group_members;
drop policy gm_delete on public.group_members;
create policy gm_select on public.group_members for select to authenticated
using (private.is_group_member(group_id, (select auth.uid())));
create policy gm_update on public.group_members for update to authenticated
using (private.is_group_owner(group_id, (select auth.uid())))
with check (private.is_group_owner(group_id, (select auth.uid())) and role in ('admin','member'));
create policy gm_delete on public.group_members for delete to authenticated
using (
  (user_id = (select auth.uid()) and role <> 'owner')
  or (private.is_group_admin(group_id, (select auth.uid())) and role = 'member')
  or (private.is_group_owner(group_id, (select auth.uid())) and role = 'admin')
);

-- invites
drop policy invites_admin_all on public.invites;
create policy invites_admin_all on public.invites for all to authenticated
using (private.is_group_admin(group_id, (select auth.uid())))
with check (private.is_group_admin(group_id, (select auth.uid())));

-- cards  (split write into insert/update/delete to remove SELECT overlap)
drop policy cards_select on public.cards;
drop policy cards_write on public.cards;
create policy cards_select on public.cards for select to authenticated
using (
  private.is_group_member(group_id, (select auth.uid()))
  and (status <> 'draft' or private.is_group_admin(group_id, (select auth.uid())))
);
create policy cards_insert on public.cards for insert to authenticated
with check (private.is_group_admin(group_id, (select auth.uid())));
create policy cards_update on public.cards for update to authenticated
using (private.is_group_admin(group_id, (select auth.uid())))
with check (private.is_group_admin(group_id, (select auth.uid())));
create policy cards_delete on public.cards for delete to authenticated
using (private.is_group_admin(group_id, (select auth.uid())));

-- challenges  (same split)
drop policy challenges_select on public.challenges;
drop policy challenges_write on public.challenges;
create policy challenges_select on public.challenges for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id
    and private.is_group_member(c.group_id, (select auth.uid()))
    and (c.status <> 'draft' or private.is_group_admin(c.group_id, (select auth.uid())))
));
create policy challenges_insert on public.challenges for insert to authenticated
with check (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and private.is_group_admin(c.group_id, (select auth.uid()))
));
create policy challenges_update on public.challenges for update to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and private.is_group_admin(c.group_id, (select auth.uid()))
))
with check (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and private.is_group_admin(c.group_id, (select auth.uid()))
));
create policy challenges_delete on public.challenges for delete to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = challenges.card_id and private.is_group_admin(c.group_id, (select auth.uid()))
));

-- player_cards
drop policy pc_select on public.player_cards;
drop policy pc_insert on public.player_cards;
create policy pc_select on public.player_cards for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = player_cards.card_id and private.is_group_member(c.group_id, (select auth.uid()))
));
create policy pc_insert on public.player_cards for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.cards c
    where c.id = player_cards.card_id and private.is_group_member(c.group_id, (select auth.uid()))
  )
);

-- bingos
drop policy bingos_select on public.bingos;
create policy bingos_select on public.bingos for select to authenticated
using (exists (
  select 1 from public.cards c
  where c.id = bingos.card_id and private.is_group_member(c.group_id, (select auth.uid()))
));

-- storage group-images policies
drop policy group_images_insert on storage.objects;
drop policy group_images_update on storage.objects;
drop policy group_images_delete on storage.objects;
create policy group_images_insert on storage.objects for insert to authenticated
with check (bucket_id = 'group-images'
  and private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())));
create policy group_images_update on storage.objects for update to authenticated
using (bucket_id = 'group-images'
  and private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())))
with check (bucket_id = 'group-images'
  and private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())));
create policy group_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'group-images'
  and private.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid())));

-- ===== Drop the now-unused public helpers =====
drop function public.is_group_member(uuid, uuid);
drop function public.is_group_admin(uuid, uuid);
drop function public.is_group_owner(uuid, uuid);

-- ===== Covering indexes for foreign keys =====
create index groups_host_idx               on public.groups (host_id);
create index cards_created_by_idx          on public.cards (created_by);
create index invites_invited_by_idx        on public.invites (invited_by);
create index invites_accepted_by_idx       on public.invites (accepted_by);
create index notifications_group_idx       on public.notifications (group_id);
create index player_card_cells_challenge_idx on public.player_card_cells (challenge_id);
