-- Create a group + owner membership + unique join code (atomic, role-safe)
create or replace function public.create_group(p_name text, p_description text default null)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group public.groups;
  v_code text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if char_length(coalesce(p_name, '')) < 1 or char_length(p_name) > 80 then
    raise exception 'Group name must be 1-80 characters';
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.groups where join_code = v_code);
  end loop;
  insert into public.groups (name, description, host_id, join_code)
  values (p_name, nullif(p_description, ''), v_uid, v_code)
  returning * into v_group;
  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner');
  return v_group;
end;
$$;

-- Join a group by code (role forced to 'member')
create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group public.groups;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_group from public.groups where join_code = upper(p_code) and status = 'active';
  if v_group.id is null then raise exception 'Invalid join code'; end if;
  if v_group.join_locked then raise exception 'Joining is disabled for this group'; end if;
  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  return v_group;
end;
$$;

-- Accept an invite by token (role taken from the invite)
create or replace function public.accept_invite(p_token text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites;
  v_group public.groups;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_invite from public.invites where token = p_token;
  if v_invite.id is null then raise exception 'Invalid invite'; end if;
  if v_invite.status <> 'pending' then raise exception 'Invite is no longer valid'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception 'Invite has expired';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, v_invite.role)
  on conflict (group_id, user_id) do nothing;
  update public.invites
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
  where id = v_invite.id;
  select * into v_group from public.groups where id = v_invite.group_id;
  return v_group;
end;
$$;

-- Public preview of an invite (reveals only minimal group info)
create or replace function public.get_invite_preview(p_token text)
returns table (group_id uuid, group_name text, group_image_path text,
               role public.member_role, expires_at timestamptz, status public.invite_status)
language sql security definer set search_path = '' stable as $$
  select g.id, g.name, g.image_path, i.role, i.expires_at, i.status
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token;
$$;

-- Grants: these RPCs are the only membership-insert path
revoke all on function public.create_group(text, text)   from public, anon;
revoke all on function public.join_group(text)           from public, anon;
revoke all on function public.accept_invite(text)        from public, anon;
revoke all on function public.get_invite_preview(text)   from public;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text)         to authenticated;
grant execute on function public.accept_invite(text)      to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
