-- Fix: deleting a user failed with "Database error deleting user".
--
-- Deleting an auth.users row cascades into public.profiles, but four FKs that
-- reference public.profiles were created with no ON DELETE action (defaulting
-- to NO ACTION). So deleting a user who hosts a group, authored a card, or
-- sent/accepted an invite was blocked by those constraints. Re-point them with
-- sensible delete rules.

-- groups.host_id (NOT NULL): a group can't exist without its owner, and SET NULL
-- is impossible on a NOT NULL column, so deleting the owner cascades the group
-- (its members/cards/player_cards/bingos then cascade in turn).
alter table public.groups drop constraint if exists groups_host_id_fkey;
alter table public.groups
  add constraint groups_host_id_fkey
  foreign key (host_id) references public.profiles(id) on delete cascade;

-- invites.invited_by (NOT NULL): an invite can't exist without its sender.
alter table public.invites drop constraint if exists invites_invited_by_fkey;
alter table public.invites
  add constraint invites_invited_by_fkey
  foreign key (invited_by) references public.profiles(id) on delete cascade;

-- cards.created_by (nullable): keep the card as group history; just forget the author.
alter table public.cards drop constraint if exists cards_created_by_fkey;
alter table public.cards
  add constraint cards_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- invites.accepted_by (nullable): keep the invite record; just forget who accepted.
alter table public.invites drop constraint if exists invites_accepted_by_fkey;
alter table public.invites
  add constraint invites_accepted_by_fkey
  foreign key (accepted_by) references public.profiles(id) on delete set null;
