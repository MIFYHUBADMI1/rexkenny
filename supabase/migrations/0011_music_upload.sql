-- 0011 — Public video bucket for admin music uploads.
--
-- 0009 deliberately ships no video bucket: music_videos only ever pointed at
-- YouTube embeds or external hosts. The "Add music" admin screen lets an editor
-- upload the official video file itself, so this adds one public bucket that
-- holds nothing but web-playable video. Song masters stay in music-private and
-- cover art stays in artist-public; nothing here changes those rules.
--
-- Note: the per-file ceiling below is the bucket's own limit. The Supabase
-- project's plan may cap uploads lower (the free tier stops at 50 MB), in which
-- case the storage API refuses the file and the admin sees that error.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-videos', 'site-videos', true, 2147483648,
   array['video/mp4','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Read rules — same shape as the other public buckets: anyone may load a file,
-- and the bucket only ever holds files under uploads/ written by staff.
-- ---------------------------------------------------------------------------
create policy "site-videos: world reads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-videos');

-- ---------------------------------------------------------------------------
-- Write rules — content staff upload, only into uploads/. Deletes reuse the
-- generic "staff delete own uploads" / "admins delete any upload" policies
-- from 0009, which are not bucket-scoped.
-- ---------------------------------------------------------------------------
create policy "site-videos: editors upload videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-videos'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'uploads'
  );
