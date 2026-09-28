-- Supabase storage upsert requires INSERT + SELECT + UPDATE policies. The buckets
-- had INSERT/UPDATE/DELETE but no SELECT, so `upload(..., { upsert: true })`
-- (INSERT ... ON CONFLICT DO UPDATE RETURNING *) failed RLS. Add the SELECT policies.

create policy avatars_select on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy group_images_select on storage.objects for select to authenticated
using (
  bucket_id = 'group-images'
  and private.is_group_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
);
