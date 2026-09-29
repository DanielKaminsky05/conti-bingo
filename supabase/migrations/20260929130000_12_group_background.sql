-- Full-bleed group background image (Snapchat-style), distinct from the small
-- group icon in image_path. Stores only the Storage object path; the object
-- lives under group-images/{group_id}/... so the existing group-images write
-- policies (owner/admin only) already cover it — no new storage policy needed.
alter table public.groups add column background_path text;
