-- ============================================================
-- 14: group co-op bingo — a shared board the whole group fills
-- ============================================================
-- A card can be authored as `game_mode = 'coop'`. Instead of each player
-- getting their own materialized card, the group shares ONE board and
-- cooperatively marks every square (blackout) as a team. Any member may mark an
-- unclaimed square; once marked, only the marker may unmark it. We record who
-- marked each square (`marked_by`) for a contributions leaderboard.
--
-- This is deliberately a SEPARATE structure from player_cards / player_card_cells
-- so the individual-play model, its check_bingo trigger, and the leaderboard
-- view are untouched.

create type public.card_game_mode as enum ('individual', 'coop');
alter table public.cards
  add column game_mode public.card_game_mode not null default 'individual';

-- One shared board per co-op card (unique card_id => idempotent creation).
create table public.coop_boards (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique references public.cards(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  completed_at timestamptz,            -- set by the trigger when every square is marked (revocable, D4)
  created_at timestamptz not null default now()
);

create table public.coop_board_cells (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.coop_boards(id) on delete cascade,
  position int not null,               -- 0..grid_size²-1, row-major
  challenge_id uuid references public.challenges(id) on delete cascade,  -- null = free space
  is_marked boolean not null default false,
  marked_by uuid references public.profiles(id) on delete set null,      -- who marked it (contribution)
  marked_at timestamptz,
  unique (board_id, position)
);
create index coop_board_cells_board_idx on public.coop_board_cells (board_id);
create index coop_board_cells_marker_idx on public.coop_board_cells (marked_by);

alter table public.coop_boards      enable row level security;
alter table public.coop_board_cells enable row level security;

-- ===== RLS =====
-- Boards: readable by group members. Created only via the RPC below.
create policy coop_boards_select on public.coop_boards for select to authenticated
using (private.is_group_member(group_id, (select auth.uid())));

-- Cells: readable by group members.
create policy coop_cells_select on public.coop_board_cells for select to authenticated
using (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_member(b.group_id, (select auth.uid()))
  )
);

-- Cells UPDATE — the core co-op rule:
--   * any group member may mark an UNCLAIMED cell (marked_by is null), and
--   * only the marker may change a cell they own (so you can't unmark someone
--     else's finished square).
-- USING gates which existing rows you may touch; WITH CHECK gates the new value
-- (marking must set marked_by = you; unmarking must clear it).
create policy coop_cells_update on public.coop_board_cells for update to authenticated
using (
  exists (
    select 1 from public.coop_boards b
    where b.id = coop_board_cells.board_id
      and private.is_group_member(b.group_id, (select auth.uid()))
  )
  and coalesce(marked_by, (select auth.uid())) = (select auth.uid())
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

-- Writes other than the mark UPDATE happen via the RPCs / trigger / cascade.
grant select          on public.coop_boards      to authenticated;
grant select, update  on public.coop_board_cells to authenticated;

-- ===== Realtime (all group members watch the shared board live) =====
alter publication supabase_realtime add table public.coop_boards;
alter publication supabase_realtime add table public.coop_board_cells;

-- ============================================================
-- get_or_create_coop_board: idempotently create + seed the shared board
-- ============================================================
-- Any group member may call it (first tap creates the board). Seeds cells as an
-- IDENTICAL layout (challenges in sort_index order; free space pre-marked in the
-- center on odd grids). Mirrors getOrCreatePlayerCard's idempotency, server-side
-- and atomic via the unique(card_id) guard.
create or replace function public.get_or_create_coop_board(p_card_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_n int;
  v_free boolean;
  v_mode public.card_game_mode;
  v_board_id uuid;
  v_free_pos int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select c.group_id, c.grid_size, c.free_space, c.game_mode
    into v_group, v_n, v_free, v_mode
  from public.cards c where c.id = p_card_id;
  if v_group is null then raise exception 'Card not found'; end if;
  if not private.is_group_member(v_group, v_uid) then
    raise exception 'Not a group member' using errcode = '42501';
  end if;
  if v_mode <> 'coop' then raise exception 'Card is not a co-op card'; end if;

  insert into public.coop_boards (card_id, group_id)
  values (p_card_id, v_group)
  on conflict (card_id) do nothing
  returning id into v_board_id;

  -- Already existed (someone else created it first): cells are already seeded.
  if v_board_id is null then
    select id into v_board_id from public.coop_boards where card_id = p_card_id;
    return v_board_id;
  end if;

  v_free_pos := case when v_free and (v_n % 2 = 1) then (v_n * v_n - 1) / 2 else -1 end;

  -- Map challenges (by sort_index) into the non-free positions, in order.
  with positions as (
    select gs as pos, (row_number() over (order by gs)) - 1 as slot
    from generate_series(0, v_n * v_n - 1) gs
    where gs <> v_free_pos
  ),
  ch as (
    select id, (row_number() over (order by sort_index)) - 1 as idx
    from public.challenges where card_id = p_card_id
  )
  insert into public.coop_board_cells (board_id, position, challenge_id, is_marked, marked_at)
  select v_board_id, p.pos, c.id, false, null
  from positions p join ch c on c.idx = p.slot;

  -- Free space (odd grids): a pre-marked, challenge-less, marker-less cell.
  if v_free_pos >= 0 then
    insert into public.coop_board_cells (board_id, position, challenge_id, is_marked, marked_at)
    values (v_board_id, v_free_pos, null, true, now());
  end if;

  return v_board_id;
end $$;

-- ============================================================
-- Blackout detection: set/clear coop_boards.completed_at (revocable)
-- ============================================================
create or replace function public.check_coop_blackout(p_board_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_marked int;
begin
  select count(*), count(*) filter (where is_marked)
    into v_total, v_marked
  from public.coop_board_cells where board_id = p_board_id;

  update public.coop_boards
  set completed_at = case when v_total > 0 and v_marked = v_total
                          then coalesce(completed_at, now())
                          else null end
  where id = p_board_id;
end $$;

create or replace function public.on_coop_cell_marked()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_coop_blackout(new.board_id);
  return new;
end $$;

create trigger coop_cell_blackout_check
  after update of is_marked on public.coop_board_cells
  for each row
  when (old.is_marked is distinct from new.is_marked)
  execute function public.on_coop_cell_marked();

-- ============================================================
-- rebuild_coop_board: drop the board so it re-seeds on next play
-- ============================================================
-- Called when a co-op card's structure/challenges change (analogous to
-- rebuild_player_cards). Admin-gated; the cascade clears cells + contributions.
create or replace function public.rebuild_coop_board(p_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select group_id into v_group from public.cards where id = p_card_id;
  if v_group is null then raise exception 'Card not found'; end if;
  if not private.is_group_admin(v_group, v_uid) then
    raise exception 'Only an owner or admin can rebuild the board' using errcode = '42501';
  end if;
  delete from public.coop_boards where card_id = p_card_id;
end $$;
