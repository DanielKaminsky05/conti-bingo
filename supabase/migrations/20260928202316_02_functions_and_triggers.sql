-- ===== updated_at maintenance =====
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles      for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.groups        for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invites       for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cards         for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.challenges    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.player_cards  for each row execute function public.set_updated_at();

-- ===== auto-create profile on signup =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if char_length(base_username) < 3 then
    base_username := 'user' || base_username;
  end if;
  base_username := left(base_username, 20);
  final_username := base_username;
  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := left(base_username, 16) || suffix::text;
  end loop;
  insert into public.profiles (id, username, name)
  values (new.id, final_username, coalesce(new.raw_user_meta_data->>'name', final_username));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== RLS helper functions (definer -> bypass RLS, avoid recursion) =====
create or replace function public.is_group_member(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members where group_id = p_group and user_id = p_user);
$$;

create or replace function public.is_group_admin(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members
                where group_id = p_group and user_id = p_user and role in ('owner','admin'));
$$;

create or replace function public.is_group_owner(p_group uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.group_members
                where group_id = p_group and user_id = p_user and role = 'owner');
$$;

-- ===== win detection (revocable): sync a single line/blackout =====
create or replace function public._sync_bingo(
  p_player_card_id uuid, p_card_id uuid, p_user_id uuid,
  p_type public.bingo_type, p_line_key text, p_complete boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_complete then
    insert into public.bingos (player_card_id, card_id, user_id, type, line_key)
    values (p_player_card_id, p_card_id, p_user_id, p_type, p_line_key)
    on conflict (player_card_id, line_key) do nothing;
  else
    delete from public.bingos where player_card_id = p_player_card_id and line_key = p_line_key;
  end if;
end;
$$;

create or replace function public.check_bingo(p_player_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_card_id uuid;
  v_user_id uuid;
  v_n int;
  v_win public.card_win_condition;
  v_marked int[];
  v_total int;
  r int;
  c int;
  line_positions int[];
  is_complete boolean;
begin
  select pc.card_id, pc.user_id, cd.grid_size, cd.win_condition
    into v_card_id, v_user_id, v_n, v_win
  from public.player_cards pc
  join public.cards cd on cd.id = pc.card_id
  where pc.id = p_player_card_id;

  if v_card_id is null then
    return;
  end if;

  select coalesce(array_agg(position), '{}') into v_marked
  from public.player_card_cells
  where player_card_id = p_player_card_id and is_marked;

  -- Line wins only when win_condition = 'line'
  if v_win = 'line' then
    for r in 0..v_n-1 loop
      line_positions := array(select generate_series(r*v_n, r*v_n + v_n - 1));
      is_complete := line_positions <@ v_marked;
      perform public._sync_bingo(p_player_card_id, v_card_id, v_user_id, 'line', 'row-' || r, is_complete);
    end loop;
    for c in 0..v_n-1 loop
      line_positions := array(select c + g*v_n from generate_series(0, v_n-1) as g);
      is_complete := line_positions <@ v_marked;
      perform public._sync_bingo(p_player_card_id, v_card_id, v_user_id, 'line', 'col-' || c, is_complete);
    end loop;
    line_positions := array(select g*v_n + g from generate_series(0, v_n-1) as g);
    perform public._sync_bingo(p_player_card_id, v_card_id, v_user_id, 'line', 'diag-0', line_positions <@ v_marked);
    line_positions := array(select g*v_n + (v_n-1-g) from generate_series(0, v_n-1) as g);
    perform public._sync_bingo(p_player_card_id, v_card_id, v_user_id, 'line', 'diag-1', line_positions <@ v_marked);
  end if;

  -- Blackout: primary win in blackout mode, bonus in line mode
  select count(*) into v_total from public.player_card_cells where player_card_id = p_player_card_id;
  is_complete := coalesce(array_length(v_marked, 1), 0) = v_total and v_total > 0;
  perform public._sync_bingo(p_player_card_id, v_card_id, v_user_id, 'blackout', 'blackout', is_complete);

  update public.player_cards pc set
    bingo_count = (select count(*) from public.bingos b where b.player_card_id = p_player_card_id),
    first_bingo_at = case when exists(select 1 from public.bingos b where b.player_card_id = p_player_card_id)
                          then coalesce(pc.first_bingo_at, now()) else null end,
    completed_at = case when exists(select 1 from public.bingos b where b.player_card_id = p_player_card_id and b.type = 'blackout')
                        then coalesce(pc.completed_at, now()) else null end
  where pc.id = p_player_card_id;
end;
$$;

-- ===== on mark/unmark: recompute counters, then check bingos =====
create or replace function public.on_cell_marked()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.player_cards pc set
    marks_count = (select count(*) from public.player_card_cells
                   where player_card_id = new.player_card_id and is_marked),
    points_total = coalesce((select sum(coalesce(ch.points, 0))
                             from public.player_card_cells cc
                             left join public.challenges ch on ch.id = cc.challenge_id
                             where cc.player_card_id = new.player_card_id and cc.is_marked), 0)
  where pc.id = new.player_card_id;
  perform public.check_bingo(new.player_card_id);
  return new;
end;
$$;

create trigger cell_bingo_check
  after update of is_marked on public.player_card_cells
  for each row
  when (old.is_marked is distinct from new.is_marked)
  execute function public.on_cell_marked();

-- ===== notifications =====
create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, group_id, type, payload)
  select gm.user_id, new.group_id, 'member_joined', jsonb_build_object('new_member_id', new.user_id)
  from public.group_members gm
  where gm.group_id = new.group_id and gm.role in ('owner','admin') and gm.user_id <> new.user_id;
  return new;
end;
$$;

create trigger member_joined_notify after insert on public.group_members
  for each row execute function public.notify_member_joined();

create or replace function public.notify_bingo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, group_id, type, payload)
  select gm.user_id, c.group_id, 'bingo_achieved',
         jsonb_build_object('winner_id', new.user_id, 'card_id', new.card_id, 'bingo_type', new.type)
  from public.cards c
  join public.group_members gm on gm.group_id = c.group_id
  where c.id = new.card_id and gm.user_id <> new.user_id;
  return new;
end;
$$;

create trigger bingo_notify after insert on public.bingos
  for each row execute function public.notify_bingo();

-- ===== lock down direct execution of internal/trigger functions =====
revoke all on function public.handle_new_user()                                              from public, anon, authenticated;
revoke all on function public.set_updated_at()                                               from public, anon, authenticated;
revoke all on function public.check_bingo(uuid)                                              from public, anon, authenticated;
revoke all on function public._sync_bingo(uuid, uuid, uuid, public.bingo_type, text, boolean) from public, anon, authenticated;
revoke all on function public.on_cell_marked()                                               from public, anon, authenticated;
revoke all on function public.notify_member_joined()                                         from public, anon, authenticated;
revoke all on function public.notify_bingo()                                                 from public, anon, authenticated;
