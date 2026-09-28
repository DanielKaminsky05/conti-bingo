-- ============================================================
-- publish_card: atomic archive-current + activate-new
-- ============================================================
create or replace function public.publish_card(p_card_id uuid)
returns public.cards language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid;
  v_status public.card_status;
  v_card public.cards;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select group_id, status into v_group, v_status from public.cards where id = p_card_id;
  if v_group is null then raise exception 'Card not found'; end if;
  if not private.is_group_admin(v_group, v_uid) then
    raise exception 'Only an owner or admin can publish cards' using errcode = '42501';
  end if;
  if v_status = 'active' then
    select * into v_card from public.cards where id = p_card_id;
    return v_card;
  end if;
  update public.cards set status = 'archived' where group_id = v_group and status = 'active';
  update public.cards set status = 'active' where id = p_card_id returning * into v_card;
  return v_card;
end $$;

-- ============================================================
-- transfer_ownership: move the owner role atomically
-- ============================================================
create or replace function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not private.is_group_owner(p_group_id, v_uid) then
    raise exception 'Only the current owner can transfer ownership' using errcode = '42501';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner) then
    raise exception 'The new owner must be a member of the group';
  end if;
  -- demote current owner first (avoid two owners), then promote the new owner
  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = v_uid and role = 'owner';
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.groups set host_id = p_new_owner where id = p_group_id;
end $$;

-- ============================================================
-- reset_edited_challenge: un-mark an edited square across all players.
-- The AFTER UPDATE OF is_marked trigger recomputes counters + revokes bingos.
-- ============================================================
create or replace function public.reset_edited_challenge(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select c.group_id into v_group
  from public.challenges ch join public.cards c on c.id = ch.card_id
  where ch.id = p_challenge_id;
  if v_group is null then raise exception 'Challenge not found'; end if;
  if not private.is_group_admin(v_group, v_uid) then
    raise exception 'Only an owner or admin can edit challenges' using errcode = '42501';
  end if;
  update public.player_card_cells set is_marked = false, marked_at = null
  where challenge_id = p_challenge_id and is_marked = true;
end $$;

-- ============================================================
-- recount_card: recompute marks/points counters for all player cards of a card
-- (used after in-place points edits, which don't fire the mark trigger).
-- ============================================================
create or replace function public.recount_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select group_id into v_group from public.cards where id = p_card_id;
  if v_group is null then raise exception 'Card not found'; end if;
  if not private.is_group_admin(v_group, v_uid) then
    raise exception 'Only an owner or admin can do that' using errcode = '42501';
  end if;
  update public.player_cards pc set
    marks_count = (select count(*) from public.player_card_cells cc where cc.player_card_id = pc.id and cc.is_marked),
    points_total = coalesce((select sum(coalesce(ch.points, 0))
                             from public.player_card_cells cc
                             left join public.challenges ch on ch.id = cc.challenge_id
                             where cc.player_card_id = pc.id and cc.is_marked), 0)
  where pc.card_id = p_card_id;
end $$;

-- ============================================================
-- rebuild_player_cards: re-materialize every player's cells for a card and
-- reset their marks/bingos (for structural / challenge-set changes).
-- ============================================================
create or replace function public.rebuild_player_cards(p_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid; v_uid uuid := (select auth.uid());
  v_grid int; v_free boolean; v_mode public.card_layout_mode;
  v_free_pos int; n_needed int;
  ch_ids uuid[];
  pc record;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select c.group_id, c.grid_size, c.free_space, c.layout_mode
    into v_group, v_grid, v_free, v_mode
  from public.cards c where c.id = p_card_id;
  if v_group is null then raise exception 'Card not found'; end if;
  if not private.is_group_admin(v_group, v_uid) then
    raise exception 'Only an owner or admin can rebuild cards' using errcode = '42501';
  end if;

  v_free_pos := case when v_free and v_grid % 2 = 1 then (v_grid * v_grid - 1) / 2 else null end;
  n_needed := v_grid * v_grid - (case when v_free_pos is not null then 1 else 0 end);

  select array_agg(id order by sort_index) into ch_ids from public.challenges where card_id = p_card_id;
  if coalesce(array_length(ch_ids, 1), 0) < n_needed then
    raise exception 'Not enough challenges (% needed, % present)', n_needed, coalesce(array_length(ch_ids, 1), 0);
  end if;

  for pc in select id from public.player_cards where card_id = p_card_id loop
    delete from public.player_card_cells where player_card_id = pc.id;
    delete from public.bingos where player_card_id = pc.id;
    update public.player_cards set
      marks_count = case when v_free_pos is not null then 1 else 0 end,
      points_total = 0, bingo_count = 0, first_bingo_at = null, completed_at = null
    where id = pc.id;

    declare
      ordered uuid[];
      idx int := 1;
      pos int;
    begin
      if v_mode = 'shuffled' then
        select array_agg(x order by random()) into ordered from unnest(ch_ids) as x;
      else
        ordered := ch_ids;
      end if;
      for pos in 0..(v_grid * v_grid - 1) loop
        if pos = v_free_pos then
          insert into public.player_card_cells (player_card_id, position, challenge_id, is_marked, marked_at)
          values (pc.id, pos, null, true, now());
        else
          insert into public.player_card_cells (player_card_id, position, challenge_id, is_marked)
          values (pc.id, pos, ordered[idx], false);
          idx := idx + 1;
        end if;
      end loop;
    end;
  end loop;
end $$;

-- ============================================================
-- Grants: these are admin/owner-facing RPCs (auth enforced internally)
-- ============================================================
revoke all on function public.publish_card(uuid)            from public, anon;
revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke all on function public.reset_edited_challenge(uuid)   from public, anon;
revoke all on function public.recount_card(uuid)             from public, anon;
revoke all on function public.rebuild_player_cards(uuid)     from public, anon;
grant execute on function public.publish_card(uuid)            to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.reset_edited_challenge(uuid)   to authenticated;
grant execute on function public.recount_card(uuid)             to authenticated;
grant execute on function public.rebuild_player_cards(uuid)     to authenticated;
