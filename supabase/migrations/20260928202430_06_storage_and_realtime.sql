-- ===== Storage buckets (public-read; writes RLS-gated) =====
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('group-images', 'group-images', true)
on conflict (id) do nothing;

-- avatars: a user may write only their own folder  avatars/{uid}/...
create policy avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- group-images: only owner/admin of the group may write  group-images/{group_id}/...
create policy group_images_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);
create policy group_images_update on storage.objects for update to authenticated
using (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid()))
)
with check (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);
create policy group_images_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'group-images'
  and public.is_group_admin(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);

-- ===== Realtime: alerts, notifications, live self-progress =====
alter publication supabase_realtime add table public.bingos;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.player_card_cells;
