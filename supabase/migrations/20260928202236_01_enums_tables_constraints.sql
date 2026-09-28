-- ===== Enums =====
create type public.card_layout_mode   as enum ('shuffled','identical');
create type public.card_win_condition as enum ('line','blackout');
create type public.card_status        as enum ('draft','active','archived');
create type public.group_status       as enum ('active','archived');
create type public.bingo_type         as enum ('line','blackout');
create type public.member_role        as enum ('owner','admin','member');
create type public.invite_status      as enum ('pending','accepted','revoked','expired');
create type public.notification_type  as enum ('member_joined','invite_received','card_published','card_replaced','bingo_achieved','out_bingoed');

-- ===== profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- ===== groups =====
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  image_path text,
  host_id uuid not null references public.profiles(id),
  join_code text not null unique,
  join_locked boolean not null default false,
  status public.group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== group_members =====
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  nickname text,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create unique index one_owner_per_group on public.group_members (group_id) where role = 'owner';
create index group_members_user_idx on public.group_members (user_id);
create index group_members_group_idx on public.group_members (group_id);

-- ===== invites =====
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text,
  token text not null unique,
  role public.member_role not null default 'member' check (role in ('member','admin')),
  status public.invite_status not null default 'pending',
  invited_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invites_group_idx on public.invites (group_id);
create index invites_email_idx on public.invites (email);

-- ===== cards =====
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  description text,
  grid_size int not null default 5 check (grid_size in (4,5,6)),
  layout_mode public.card_layout_mode not null,
  free_space boolean not null default true check (free_space = false or grid_size % 2 = 1),
  win_condition public.card_win_condition not null default 'line',
  status public.card_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz check (ends_at is null or starts_at is null or ends_at > starts_at),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_card_per_group on public.cards (group_id) where status = 'active';
create index cards_group_status_idx on public.cards (group_id, status);

-- ===== challenges =====
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  points int not null default 1 check (points > 0),
  sort_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, sort_index)
);
create index challenges_card_idx on public.challenges (card_id);

-- ===== player_cards (with denormalized leaderboard counters) =====
create table public.player_cards (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shuffle_seed bigint,
  marks_count int not null default 0,
  points_total int not null default 0,
  bingo_count int not null default 0,
  first_bingo_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, user_id)
);
create index player_cards_card_idx on public.player_cards (card_id);
create index player_cards_user_idx on public.player_cards (user_id);

-- ===== player_card_cells =====
create table public.player_card_cells (
  id uuid primary key default gen_random_uuid(),
  player_card_id uuid not null references public.player_cards(id) on delete cascade,
  position int not null,
  challenge_id uuid references public.challenges(id) on delete cascade,
  is_marked boolean not null default false,
  marked_at timestamptz,
  unique (player_card_id, position)
);
create index player_card_cells_pc_idx on public.player_card_cells (player_card_id);
create index player_card_cells_marked_idx on public.player_card_cells (player_card_id) where is_marked;

-- ===== bingos =====
create table public.bingos (
  id uuid primary key default gen_random_uuid(),
  player_card_id uuid not null references public.player_cards(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.bingo_type not null,
  line_key text not null,
  achieved_at timestamptz not null default now(),
  unique (player_card_id, line_key)
);
create index bingos_card_idx on public.bingos (card_id);
create index bingos_user_idx on public.bingos (user_id);

-- ===== notifications =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
