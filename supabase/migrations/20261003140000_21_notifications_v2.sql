-- ============================================================
-- 21: Fuller notification system
--
--  * Payloads carry display names (actor_name / group_name / card_title) so the
--    notification center can render "Ana joined Section 1A" without extra reads.
--  * bingo_achieved: only a player's FIRST bingo on a card notifies the group
--    (was: every line → every member). Removed again if the player's last bingo
--    on that card is revoked (D4).
--  * out_bingoed (new): the player(s) holding first place (by bingo count) when
--    someone else's bingo puts them strictly ahead. Removed if that bingo is revoked.
--  * card_published / card_replaced (new): a card becoming active notifies the
--    group; "replaced" when an active card was archived in the same transaction
--    (publish_card archives then activates).
--  * invite_received (new): an email invite to an EXISTING account notifies that
--    user; cleaned up when the invite stops being pending.
--
-- All writers are SECURITY DEFINER trigger functions (clients still never insert
-- notifications). Direct EXECUTE is revoked from every API role.
-- ============================================================

-- ----- helper: a user's display name -------------------------
create or replace function private.display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.name), ''), p.username)
  from public.profiles p
  where p.id = p_user
$$;

-- Cleanup of bingo notifications looks rows up by the player card they're about.
create index if not exists notifications_player_card_idx
  on public.notifications ((payload ->> 'player_card_id'))
  where payload ? 'player_card_id';

-- ----- member_joined: add names ------------------------------
create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_group_name text;
  v_actor_name text := private.display_name(new.user_id);
begin
  select g.name into v_group_name from public.groups g where g.id = new.group_id;

  insert into public.notifications (user_id, group_id, type, payload)
  select gm.user_id, new.group_id, 'member_joined',
         jsonb_build_object(
           'new_member_id', new.user_id,
           'actor_id', new.user_id,
           'actor_name', v_actor_name,
           'group_name', v_group_name)
  from public.group_members gm
  where gm.group_id = new.group_id
    and gm.role in ('owner', 'admin')
    and gm.user_id <> new.user_id;
  return new;
end;
$$;

-- ----- bingo inserted: first-bingo + out_bingoed -------------
create or replace function public.notify_bingo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_group_id uuid;
  v_group_name text;
  v_card_title text;
  v_actor_name text := private.display_name(new.user_id);
  v_count int;      -- this player's bingos on the card, including NEW
  v_rival_max int;  -- best bingo count among everyone else on the card
begin
  select c.group_id, c.title, g.name
    into v_group_id, v_card_title, v_group_name
  from public.cards c
  join public.groups g on g.id = c.group_id
  where c.id = new.card_id;
  if v_group_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.bingos b
  where b.player_card_id = new.player_card_id;

  -- First bingo on this card → tell the rest of the group.
  if v_count = 1 then
    insert into public.notifications (user_id, group_id, type, payload)
    select gm.user_id, v_group_id, 'bingo_achieved',
           jsonb_build_object(
             'bingo_id', new.id,
             'player_card_id', new.player_card_id,
             'winner_id', new.user_id,
             'actor_id', new.user_id,
             'actor_name', v_actor_name,
             'card_id', new.card_id,
             'card_title', v_card_title,
             'group_name', v_group_name,
             'bingo_type', new.type)
    from public.group_members gm
    where gm.group_id = v_group_id
      and gm.user_id <> new.user_id;
  end if;

  -- Out-bingoed: this bingo moved the player from tied-or-behind to strictly
  -- first. Rivals' counters are current (only their own marks change them).
  select coalesce(max(pc.bingo_count), 0) into v_rival_max
  from public.player_cards pc
  where pc.card_id = new.card_id
    and pc.id <> new.player_card_id;

  if v_rival_max > 0 and v_count = v_rival_max + 1 then
    insert into public.notifications (user_id, group_id, type, payload)
    select pc.user_id, v_group_id, 'out_bingoed',
           jsonb_build_object(
             'bingo_id', new.id,
             'player_card_id', new.player_card_id,
             'actor_id', new.user_id,
             'actor_name', v_actor_name,
             'card_id', new.card_id,
             'card_title', v_card_title,
             'group_name', v_group_name)
    from public.player_cards pc
    join public.group_members gm
      on gm.group_id = v_group_id and gm.user_id = pc.user_id
    where pc.card_id = new.card_id
      and pc.id <> new.player_card_id
      and pc.bingo_count = v_rival_max;
  end if;

  return new;
end;
$$;

-- ----- bingo revoked: retract what it caused ------------------
create or replace function public.retract_bingo_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The lead this bingo took no longer stands.
  delete from public.notifications n
  where n.payload ->> 'player_card_id' = old.player_card_id::text
    and n.type = 'out_bingoed'
    and n.payload ->> 'bingo_id' = old.id::text;

  -- "X got BINGO" stays true while the player still holds any bingo on the card.
  if not exists (select 1 from public.bingos b where b.player_card_id = old.player_card_id) then
    delete from public.notifications n
    where n.payload ->> 'player_card_id' = old.player_card_id::text
      and n.type = 'bingo_achieved';
  end if;

  return old;
end;
$$;

create trigger bingo_retract_notify after delete on public.bingos
  for each row execute function public.retract_bingo_notifications();

-- ----- card goes live: published / replaced -------------------
create or replace function public.notify_card_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_group_name text;
  v_replaced boolean;
begin
  -- An active card leaving 'active' — remember it for a publish later in this
  -- transaction (publish_card archives the old card, then activates the new one).
  if tg_op = 'UPDATE' and old.status = 'active' and new.status <> 'active' then
    perform set_config('conti.card_replaced_group', new.group_id::text, true);
    return new;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    v_replaced := coalesce(current_setting('conti.card_replaced_group', true), '') = new.group_id::text;
    select g.name into v_group_name from public.groups g where g.id = new.group_id;

    insert into public.notifications (user_id, group_id, type, payload)
    select gm.user_id, new.group_id,
           (case when v_replaced then 'card_replaced' else 'card_published' end)::public.notification_type,
           jsonb_build_object(
             'card_id', new.id,
             'card_title', new.title,
             'group_name', v_group_name,
             'actor_id', v_actor,
             'actor_name', private.display_name(v_actor),
             'starts_at', new.starts_at)
    from public.group_members gm
    where gm.group_id = new.group_id
      and gm.user_id is distinct from v_actor;
  end if;

  return new;
end;
$$;

create trigger card_status_notify after insert or update of status on public.cards
  for each row execute function public.notify_card_status();

-- ----- invites: notify an existing account -------------------
create or replace function public.notify_invite_received()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_group_name text;
begin
  if new.email is null or new.status <> 'pending' then
    return new;
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(btrim(new.email))
  limit 1;
  if v_user is null
     or exists (select 1 from public.group_members gm
                where gm.group_id = new.group_id and gm.user_id = v_user) then
    return new;
  end if;

  select g.name into v_group_name from public.groups g where g.id = new.group_id;

  insert into public.notifications (user_id, group_id, type, payload)
  values (v_user, new.group_id, 'invite_received',
          jsonb_build_object(
            'invite_id', new.id,
            'token', new.token,
            'role', new.role,
            'group_name', v_group_name,
            'actor_id', new.invited_by,
            'actor_name', private.display_name(new.invited_by)));
  return new;
end;
$$;

create trigger invite_received_notify after insert on public.invites
  for each row execute function public.notify_invite_received();

-- Accepted → read; revoked/expired → gone (the link no longer works).
create or replace function public.settle_invite_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' then
    update public.notifications n set read_at = coalesce(n.read_at, now())
    where n.type = 'invite_received'
      and n.group_id = new.group_id
      and n.payload ->> 'invite_id' = new.id::text;
  else
    delete from public.notifications n
    where n.type = 'invite_received'
      and n.group_id = new.group_id
      and n.payload ->> 'invite_id' = new.id::text;
  end if;
  return new;
end;
$$;

create trigger invite_settled_notify after update of status on public.invites
  for each row
  when (old.status = 'pending' and new.status <> 'pending')
  execute function public.settle_invite_notification();

-- ----- backfill names on existing rows ------------------------
update public.notifications n
set payload = n.payload || jsonb_strip_nulls(jsonb_build_object(
      'actor_id', n.payload ->> 'new_member_id',
      'actor_name', private.display_name((n.payload ->> 'new_member_id')::uuid),
      'group_name', (select g.name from public.groups g where g.id = n.group_id)))
where n.type = 'member_joined'
  and n.payload ? 'new_member_id'
  and not n.payload ? 'actor_name';

update public.notifications n
set payload = n.payload || jsonb_strip_nulls(jsonb_build_object(
      'actor_id', n.payload ->> 'winner_id',
      'actor_name', private.display_name((n.payload ->> 'winner_id')::uuid),
      'card_title', (select c.title from public.cards c where c.id = (n.payload ->> 'card_id')::uuid),
      'group_name', (select g.name from public.groups g where g.id = n.group_id)))
where n.type = 'bingo_achieved'
  and n.payload ? 'winner_id'
  and not n.payload ? 'actor_name';

-- ----- lock down direct execution -----------------------------
revoke all on function private.display_name(uuid)                  from public, anon, authenticated;
revoke all on function public.notify_member_joined()               from public, anon, authenticated;
revoke all on function public.notify_bingo()                       from public, anon, authenticated;
revoke all on function public.retract_bingo_notifications()        from public, anon, authenticated;
revoke all on function public.notify_card_status()                 from public, anon, authenticated;
revoke all on function public.notify_invite_received()             from public, anon, authenticated;
revoke all on function public.settle_invite_notification()         from public, anon, authenticated;
