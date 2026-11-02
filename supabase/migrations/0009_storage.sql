-- 0009 — Storage buckets and their access rules.
--
-- The public/private split is the point of this file:
--   public buckets  -> what a visitor or a fan may ever load
--   private buckets -> masters, contracts, exports; reachable only by staff
--                      through a signed URL issued server-side.
-- The site never serves a master recording from a public bucket.
--
-- Note: this migration runs as the project's `postgres` role, which owns the
-- storage schema objects on a hosted Supabase project. On a self-hosted stack,
-- run it as the storage owner.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artist-public',    'artist-public',    true,  15728640,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('release-artwork',  'release-artwork',  false, 26214400,
   array['image/jpeg','image/png','image/webp']),
  ('music-public',     'music-public',     true,  10485760,
   array['audio/mpeg','audio/mp4']),
  ('music-private',    'music-private',    false, 262144000,
   array['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/aac','audio/ogg','audio/mp4']),
  ('epk-assets',       'epk-assets',       false, 52428800,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('video-thumbnails', 'video-thumbnails', true,   5242880,
   array['image/jpeg','image/png','image/webp']),
  ('private-documents','private-documents',false, 20971520,
   array['application/pdf','text/csv','application/json','application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Read rules
-- ---------------------------------------------------------------------------
create policy "artist-public: world reads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'artist-public');

create policy "video-thumbnails: world reads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'video-thumbnails');

-- Previews are readable by anyone, but only under the previews/ prefix, so a
-- master dropped in this bucket by mistake still cannot be listed.
create policy "music-public: world reads previews"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'music-public' and split_part(name, '/', 1) = 'previews');

create policy "release-artwork: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'release-artwork' and public.is_staff());

create policy "music-private: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'music-private' and public.is_staff());

create policy "epk-assets: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'epk-assets' and public.is_staff());

create policy "private-documents: admins read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'private-documents' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Write rules — content staff upload, only into folders that match the bucket's
-- purpose. Ownership-scoped deletes keep an editor from wiping someone else's
-- file.
-- ---------------------------------------------------------------------------
create policy "artist-public: editors upload images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'artist-public'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'press'
  );

create policy "release-artwork: editors upload covers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'release-artwork'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'covers'
  );

create policy "music-public: editors upload previews"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'music-public'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'previews'
  );

create policy "music-private: editors upload masters"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'music-private'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'masters'
  );

create policy "epk-assets: editors upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'epk-assets' and public.can_edit_content());

create policy "video-thumbnails: editors upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'video-thumbnails'
    and public.can_edit_content()
    and split_part(name, '/', 1) = 'thumbnails'
  );

create policy "private-documents: admins upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'private-documents' and public.is_admin());

-- Nobody deletes a file they did not upload, except an admin.
create policy "staff delete own uploads"
  on storage.objects for delete
  to authenticated
  using (
    public.can_edit_content()
    and owner = public.auth_uid()::text
  );

create policy "admins delete any upload"
  on storage.objects for delete
  to authenticated
  using (public.is_admin());

-- There is deliberately no UPDATE policy on storage.objects: replacing bytes in
-- place would let a released cover art file change underneath a distributor.
-- Upload a new path, point the row at it, keep the old file for the record.
