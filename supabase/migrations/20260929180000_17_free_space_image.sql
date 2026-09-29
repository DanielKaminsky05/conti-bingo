-- ============================================================
-- 17: optional background image for the free space
-- ============================================================
-- The free space isn't backed by a challenge row (it's the derived center tile),
-- so its image lives on the card. Stored in the public `group-images` bucket
-- under `{groupId}/challenges/...` like square images.

alter table public.cards add column free_space_image_path text;
