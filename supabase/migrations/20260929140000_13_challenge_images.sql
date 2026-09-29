-- ============================================================
-- 13: per-square background images
-- ============================================================
-- A challenge (square) can now carry an optional background image, and its
-- text becomes optional so a square may be image-only, text-only, or both.
-- Images live in the existing public `group-images` bucket under
-- `{groupId}/challenges/...`, so migration 06's storage RLS already governs
-- who may upload/read them (group admin writes, group member reads).

alter table public.challenges add column image_path text;

-- Text is no longer mandatory (image-only squares). The existing
-- `char_length(text) between 1 and 300` check passes when text is null, so it
-- still bounds any provided text.
alter table public.challenges alter column text drop not null;

-- ...but a square must have SOMETHING to render.
alter table public.challenges
  add constraint challenges_text_or_image check (text is not null or image_path is not null);
