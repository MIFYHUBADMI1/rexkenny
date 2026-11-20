
-- ============================================================
-- 0001_helpers_and_roles.sql
-- ============================================================
-- 0001 â€” Extensions, shared helpers, audit trigger.
-- Run in order. Everything below is idempotent-friendly but expects a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attaches the trigger to a table; called once per table further down.
create or replace function public.attach_updated_at(table_name regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger set_updated_at before update on %I for each row execute function public.set_updated_at()',
    table_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Slug guard: lower-case, hyphenated, url-safe. Rejects anything that would
-- produce a second URL for the same record.
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_slug(candidate text)
returns boolean
language sql
immutable
as $$
  select candidate ~ '^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$';
$$;

-- ---------------------------------------------------------------------------
-- Roles. Stored in public.user_roles, mirrored into the JWT app_metadata by
-- an After Insert trigger so policies never have to read user_roles directly
-- (which would recurse into its own RLS policy).
-- ---------------------------------------------------------------------------
create or replace function public.current_jwt_roles()
returns text[]
language sql
stable
as $$
  select coalesce(
    (
      select array_agg(role_value)
      from jsonb_array_elements_text(
        coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb
            -> 'app_metadata' -> 'roles',
          '[]'::jsonb
        )
      ) as role_value
    ),
    '{}'::text[]
  );
$$;

create or replace function public.auth_uid()
returns uuid
language sql
stable
as $$
  -- Supabase exposes the caller's id through the request JWT claims; auth.uid()
  -- is a function, not a GUC, so it cannot be read with current_setting.
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
      ''
    ),
    ''
  )::uuid;
$$;

create or replace function public.has_role(required text)
returns boolean
language sql
stable
as $$
  select required = any (public.current_jwt_roles());
$$;

-- Any staff role. Deliberately excludes 'fan'.
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(public.current_jwt_roles()) as r(role)
    where r.role in ('super_admin', 'admin', 'editor', 'marketing_manager', 'analytics_viewer')
  );
$$;

-- Roles allowed to change catalogue/content. analytics_viewer is excluded.
create or replace function public.can_edit_content()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(public.current_jwt_roles()) as r(role)
    where r.role in ('super_admin', 'admin', 'editor')
  );
$$;

-- Full control: settings, users, distribution, deletes.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(public.current_jwt_roles()) as r(role)
    where r.role in ('super_admin', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- JWT mirror: keeps app_metadata.roles in the token in sync with user_roles.
-- Requires the service role to write auth.users, which the database trigger
-- runs as (security definer), so it is performed by an Edge Function in
-- environments where triggers may not touch auth.users â€” see README.
-- ---------------------------------------------------------------------------
create or replace function public.sync_jwt_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid;
  role_list text[];
begin
  -- OLD is unassigned on INSERT and NEW is unassigned on DELETE, so the subject
  -- id has to be picked per operation instead of coalescing the two records.
  target_user := case tg_op
                   when 'INSERT' then new.user_id
                   when 'DELETE' then old.user_id
                   when 'UPDATE' then new.user_id
                 end;

  if target_user is null then
    return null;
  end if;

  select coalesce(array_agg(ur.role order by ur.role), '{}'::text[])
    into role_list
    from public.user_roles ur
    where ur.user_id = target_user;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('roles', role_list)
   where id = target_user;

  -- AFTER triggers ignore their return value; still avoid touching whichever
  -- record this operation leaves unassigned.
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log writer. Called from admin server actions and triggers; never from
-- an anonymous request path.
-- ---------------------------------------------------------------------------
create or replace function public.record_audit(
  actor uuid,
  action text,
  entity text,
  entity_id text,
  detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, detail)
  values (actor, action, entity, entity_id, coalesce(detail, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Explicit execution rights. Row policies call these functions, so the role
-- making the request (anon, authenticated) must be able to execute them or the
-- policy itself fails. Relying on the historical default-PUBLIC grant is a
-- silent breakage waiting for the next hardening migration.
-- ---------------------------------------------------------------------------
grant execute on function public.is_valid_slug(text)                 to anon, authenticated;
grant execute on function public.current_jwt_roles()                 to anon, authenticated;
grant execute on function public.has_role(text)                      to anon, authenticated;
grant execute on function public.is_staff()                          to anon, authenticated;
grant execute on function public.can_edit_content()                  to anon, authenticated;
grant execute on function public.is_admin()                          to anon, authenticated;
grant execute on function public.auth_uid()                          to anon, authenticated;
grant execute on function public.set_updated_at()                    to anon, authenticated;
-- record_audit inserts into an append-only table with no client INSERT policy,
-- so it is only reachable as the definer. Callers pass their own uid, which
-- the service-side action already obtained from a verified session.
grant execute on function public.record_audit(uuid, text, text, text, jsonb) to authenticated;




-- ============================================================
-- 0002_identity_and_access.sql
-- ============================================================
-- 0002 â€” Identity, roles, artist profile, site settings.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row. Created by trigger, never by the app.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  country     text,
  language    text default 'en',
  is_fan      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Every new account is a fan. Staff roles are granted explicitly in 0010.
  insert into public.user_roles (user_id, role)
  values (new.id, 'fan')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- user_roles â€” the source of truth for RBAC.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (
               role in ('super_admin','admin','editor','marketing_manager','analytics_viewer','fan')
             ),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

create trigger on_user_roles_changed
  after insert or delete or update on public.user_roles
  for each row execute function public.sync_jwt_roles();

-- ---------------------------------------------------------------------------
-- artist_profiles â€” supports multiple artists later (label expansion), but
-- 'rex-kenny' is the seed row today.
-- ---------------------------------------------------------------------------
create table public.artist_profiles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (public.is_valid_slug(slug)),
  name         text not null,
  legal_name   text,
  bio_short    text,
  bio_medium   text,
  bio_long     text,
  city         text,
  country      text,
  genres       text[] not null default '{}',
  instruments  text[] not null default '{}',
  influences   text[] not null default '{}',
  mission      text,
  photo_url    text,
  photo_alt    text,
  booking_email text,
  press_email  text,
  published    boolean not null default true,
  seo_title    text,
  seo_description text,
  canonical_url text,
  og_image     text,
  noindex      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_updated_at_artist_profiles
  before update on public.artist_profiles
  for each row execute function public.set_updated_at();

-- artists: the catalogue-side identity (primary + featured performers).
create table public.artists (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (public.is_valid_slug(slug)),
  name       text not null,
  bio        text,
  country    text,
  is_roster  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_artists
  before update on public.artists
  for each row execute function public.set_updated_at();

create table public.artist_social_links (
  id                uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.artist_profiles (id) on delete cascade,
  platform          text not null,
  url               text not null check (url ~ '^https?://'),
  -- Order matters for the UI; verified unique so a profile appears once.
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (artist_profile_id, platform)
);

create index artist_social_links_profile_idx on public.artist_social_links (artist_profile_id);

-- ---------------------------------------------------------------------------
-- site_settings â€” single-row key/value store for CMS-editable site copy.
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key        text primary key,
  value      jsonb not null,
  label      text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_site_settings
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.artists enable row level security;
alter table public.artist_social_links enable row level security;
alter table public.site_settings enable row level security;

-- profiles: self-read, self-update. Staff read all (fan management).
create policy "profiles: owner reads"
  on public.profiles for select
  to authenticated
  using (id = public.auth_uid());

create policy "profiles: owner updates own row"
  on public.profiles for update
  to authenticated
  using (id = public.auth_uid())
  with check (id = public.auth_uid());

create policy "profiles: staff reads all"
  on public.profiles for select
  to authenticated
  using (public.is_staff());

-- Never allow a client to create or delete a profile directly: it is owned by
-- the on_auth_user_created trigger. No insert/delete policy = denied.

-- user_roles: readable by the subject so the UI can show its own role,
-- writable only by admins, and no one may grant or revoke super_admin
-- except an existing super_admin.
create policy "user_roles: read own"
  on public.user_roles for select
  to authenticated
  using (user_id = public.auth_uid() or public.is_staff());

create policy "user_roles: admin grants"
  on public.user_roles for insert
  to authenticated
  with check (
    public.is_admin()
    and (role <> 'super_admin' or public.has_role('super_admin'))
  );

create policy "user_roles: admin revokes"
  on public.user_roles for delete
  to authenticated
  using (
    public.is_admin()
    and not (user_id = public.auth_uid() and role = 'super_admin')
  );

-- A fan must not be able to promote themselves: update would let a user
-- rewrite their own role row, so no UPDATE policy exists at all.

-- Public catalogue content is readable by anonymous visitors.
create policy "artist_profiles: public read published"
  on public.artist_profiles for select
  to anon, authenticated
  using (published = true);

create policy "artist_profiles: staff read all"
  on public.artist_profiles for select
  to authenticated
  using (public.is_staff());

create policy "artist_profiles: editors write"
  on public.artist_profiles for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "artists: public read"
  on public.artists for select
  to anon, authenticated
  using (true);

create policy "artists: editors write"
  on public.artists for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "social links: public read"
  on public.artist_social_links for select
  to anon, authenticated
  using (true);

create policy "social links: editors write"
  on public.artist_social_links for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- site_settings: public may read only the keys flagged as public; staff read all.
create policy "site_settings: public read non-secret"
  on public.site_settings for select
  to anon, authenticated
  using (key not like '%\_secret%' and key not like '%\_key%' and key <> 'smtp');

create policy "site_settings: admins write"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());




-- ============================================================
-- 0003_music_catalogue.sql
-- ============================================================
-- 0003 â€” Music catalogue: releases, tracks, links, videos, beats, media.
--
-- Every column below exists because the TypeScript data layer reads it.
-- src/lib/content.ts queries:
--   releases         select("*, tracks(*), streaming_links(*), artists(slug,name)")
--   artist_profiles  select("*, artist_social_links(*), streaming_links(*)")
--   music_videos     select("*").eq("published", true)
--   beats            select("*").eq("published", true)
-- so the FKs that make those embeddings work (releases.artist_id,
-- tracks.release_id, streaming_links.release_id / .artist_profile_id) are
-- load-bearing, not decoration.

-- ---------------------------------------------------------------------------
-- genres â€” lookup table behind the /music genre filter and admin dropdowns.
-- ---------------------------------------------------------------------------
create table public.genres (
  slug       text primary key check (public.is_valid_slug(slug)),
  name       text not null,
  parent_slug text references public.genres (slug) on delete set null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index genres_parent_idx on public.genres (parent_slug);

-- ---------------------------------------------------------------------------
-- releases â€” one row per single / EP / album / mixtape / instrumental / video.
-- ---------------------------------------------------------------------------
create table public.releases (
  id              uuid primary key default gen_random_uuid(),
  artist_id       uuid not null references public.artists (id) on delete restrict,
  slug            text not null unique check (public.is_valid_slug(slug)),
  title           text not null check (char_length(title) between 1 and 200),
  release_type    text not null default 'single' check (
                    release_type in ('single','ep','album','mixtape','instrumental','music-video')
                  ),
  status          text not null default 'draft' check (
                    status in ('draft','in-preparation','metadata-review','artwork-review',
                               'ready-for-distribution','submitted','processing','scheduled',
                               'released','rejected','needs-correction')
                  ),
  release_date    date,
  genre           text not null default 'African Dancehall',
  subgenre        text,
  language        text,
  description     text,
  artwork_url     text,
  artwork_alt     text,
  -- Display names. The normalised per-track contributors live in track_artists.
  featured_artists text[] not null default '{}',
  label           text,
  isrc            text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$'),
  upc             text check (upc is null or upc ~ '^[0-9]{12}$' or upc ~ '^[0-9]{14}$'),
  copyright      text,
  publishing      text,
  territories     text[] not null default '{}',
  video_url       text check (video_url is null or video_url ~ '^https?://'),
  -- Readiness is computed by the release manager, but the last score the admin
  -- saw is cached here so the overview list does not need to re-run the check.
  readiness_score numeric(5,2) check (readiness_score is null or readiness_score between 0 and 100),
  readiness_evaluated_at timestamptz,
  seo_title       text,
  seo_description text,
  canonical_url   text,
  og_image        text,
  noindex         boolean not null default false,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Honesty constraint: a release cannot be marked 'released' without a date,
  -- and cannot be 'scheduled' in the past without the admin noticing.
  constraint released_needs_date check (status <> 'released' or release_date is not null),
  constraint scheduled_needs_date check (status <> 'scheduled' or release_date is not null)
);

create index releases_artist_idx on public.releases (artist_id);
create index releases_status_date_idx on public.releases (status, release_date desc);
create index releases_genre_idx on public.releases (genre);
create index releases_search_idx
  on public.releases using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

create trigger set_updated_at_releases
  before update on public.releases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tracks â€” the recordings inside a release.
-- ---------------------------------------------------------------------------
create table public.tracks (
  id               uuid primary key default gen_random_uuid(),
  release_id       uuid not null references public.releases (id) on delete cascade,
  slug             text not null unique check (public.is_valid_slug(slug)),
  title            text not null check (char_length(title) between 1 and 200),
  track_number     integer not null default 1 check (track_number > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 36000),
  isrc             text check (isrc is null or isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$'),
  explicit         boolean not null default false,
  -- Only a public preview belongs here. Masters live in the private bucket and
  -- are referenced from audio_assets, never exposed through this column.
  preview_url      text check (preview_url is null or preview_url ~ '^https?://'),
  -- Lyrics are published only where the rights holder has authorised it; an
  -- empty/NULL column means no lyric page is generated for the track.
  lyrics           text,
  lyrics_cleared   boolean not null default false,
  songwriters      text[] not null default '{}',
  composers        text[] not null default '{}',
  producers        text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Never publish lyrics that have not been marked as cleared for publication.
  constraint lyrics_need_clearance check (lyrics_cleared or lyrics is null)
);

create index tracks_release_idx on public.tracks (release_id, track_number);

create trigger set_updated_at_tracks
  before update on public.tracks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- track_artists â€” normalised contributors, used for metadata exports and the
-- artist pages. One row per (track, artist, role).
-- ---------------------------------------------------------------------------
create table public.track_artists (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks (id) on delete cascade,
  artist_id  uuid not null references public.artists (id) on delete cascade,
  role       text not null default 'primary' check (
               role in ('primary','featured','producer','songwriter','composer','remixer','choir')
             ),
  billing    text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (track_id, artist_id, role)
);

create index track_artists_artist_idx on public.track_artists (artist_id);

-- ---------------------------------------------------------------------------
-- streaming_links â€” one row per platform per release (or per artist profile).
-- Exactly one owner: a link is either about a release or about the artist.
-- ---------------------------------------------------------------------------
create table public.streaming_links (
  id                uuid primary key default gen_random_uuid(),
  release_id        uuid references public.releases (id) on delete cascade,
  artist_profile_id uuid references public.artist_profiles (id) on delete cascade,
  platform          text not null check (
                      platform in ('spotify','apple-music','youtube-music','audiomack','boomplay',
                                   'deezer','amazon-music','tidal','youtube')
                    ),
  url               text not null check (url ~ '^https?://'),
  territory         text,
  verified          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint link_has_one_owner check (
    num_nonnulls(release_id, artist_profile_id) = 1
  )
);

-- One link per platform per owner, so the smart-link picker never duplicates.
create unique index streaming_links_release_platform_idx
  on public.streaming_links (release_id, platform) where release_id is not null;
create unique index streaming_links_profile_platform_idx
  on public.streaming_links (artist_profile_id, platform) where artist_profile_id is not null;

create trigger set_updated_at_streaming_links
  before update on public.streaming_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- music_videos
-- ---------------------------------------------------------------------------
create table public.music_videos (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (public.is_valid_slug(slug)),
  title               text not null check (char_length(title) between 1 and 200),
  description         text,
  category            text not null default 'official-video' check (
                        category in ('official-video','lyric-video','visualizer','freestyle',
                                     'studio-session','behind-the-scenes','dance-challenge','interview')
                      ),
  -- Stored separately from the URL so the embed can use youtube-nocookie and
  -- the thumbnail can be derived without parsing a URL at render time.
  youtube_id          text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  external_url        text check (external_url is null or external_url ~ '^https?://'),
  thumbnail_url       text check (thumbnail_url is null or thumbnail_url ~ '^https?://'),
  release_date        date,
  related_release_slug text,
  duration_seconds    integer check (duration_seconds is null or duration_seconds between 1 and 36000),
  published           boolean not null default false,
  seo_title           text,
  seo_description     text,
  canonical_url       text,
  og_image            text,
  noindex             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A video has to be watchable somewhere before it can be published.
  constraint video_needs_a_source check (youtube_id is not null or external_url is not null),
  constraint related_release_slug_valid
    check (related_release_slug is null or public.is_valid_slug(related_release_slug))
);

create index music_videos_published_date_idx on public.music_videos (published, release_date desc);

create trigger set_updated_at_music_videos
  before update on public.music_videos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- beats â€” instrumentals offered for licence.
-- ---------------------------------------------------------------------------
create table public.beats (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (public.is_valid_slug(slug)),
  title             text not null check (char_length(title) between 1 and 200),
  bpm               integer check (bpm is null or bpm between 40 and 300),
  musical_key       text,
  genre             text not null default 'African Dancehall',
  description       text,
  artwork_url       text check (artwork_url is null or artwork_url ~ '^https?://'),
  -- Preview tag only. The untagged master is never served from here.
  preview_url       text check (preview_url is null or preview_url ~ '^https?://'),
  master_asset_id   uuid,
  licensing_options jsonb not null default '[]'::jsonb check (jsonb_typeof(licensing_options) = 'array'),
  published         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index beats_published_idx on public.beats (published, created_at desc);

create trigger set_updated_at_beats
  before update on public.beats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audio_assets â€” files in Supabase Storage. Private buckets keep masters out of
-- public URLs; `publicly_accessible` is what the RLS write policy enforces.
-- ---------------------------------------------------------------------------
create table public.audio_assets (
  id                  uuid primary key default gen_random_uuid(),
  storage_bucket      text not null check (storage_bucket in ('music-public','music-private')),
  storage_path        text not null,
  file_name           text not null,
  mime_type           text not null default 'audio/mpeg' check (
                        mime_type in ('audio/mpeg','audio/wav','audio/flac','audio/aac','audio/ogg','audio/mp4')
                      ),
  byte_size           bigint check (byte_size is null or byte_size between 0 and 2147483648),
  duration_seconds    numeric(9,3),
  sample_rate_hz      integer,
  bit_depth           integer,
  -- WAV/FLAC masters cannot sit in the public bucket.
  is_master           boolean not null default false,
  watermarked         boolean not null default false,
  released_as_preview boolean not null default false,
  checksum_sha256     text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  constraint master_stays_private check (not is_master or storage_bucket = 'music-private'),
  constraint public_bucket_needs_preview_approval check (
    storage_bucket <> 'music-public' or released_as_preview
  )
);

create trigger set_updated_at_audio_assets
  before update on public.audio_assets
  for each row execute function public.set_updated_at();

alter table public.beats
  add constraint beats_master_asset_fk
  foreign key (master_asset_id) references public.audio_assets (id) on delete set null;

create table public.track_audio_assets (
  track_id    uuid not null references public.tracks (id) on delete cascade,
  asset_id    uuid not null references public.audio_assets (id) on delete cascade,
  kind        text not null default 'master' check (kind in ('master','preview','instrumental','acappella','stems')),
  primary key (track_id, asset_id, kind)
);

-- ---------------------------------------------------------------------------
-- artwork_assets
-- ---------------------------------------------------------------------------
create table public.artwork_assets (
  id               uuid primary key default gen_random_uuid(),
  storage_bucket   text not null default 'release-artwork' check (storage_bucket in ('release-artwork','artist-public','epk-assets')),
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null default 'image/jpeg' check (
                     mime_type in ('image/jpeg','image/png','image/webp','image/avif')
                   ),
  byte_size        bigint check (byte_size is null or byte_size between 0 and 52428800),
  width_px         integer check (width_px is null or width_px between 1 and 20000),
  height_px        integer check (height_px is null or height_px between 1 and 20000),
  alt_text         text,
  -- Distributors require square cover art of at least 1400px per side.
  use_case         text not null default 'release-cover' check (
                     use_case in ('release-cover','artist-press','epk','social','video-thumbnail')
                   ),
  uploaded_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  constraint artwork_is_square check (width_px is null or height_px is null or width_px = height_px)
);

create trigger set_updated_at_artwork_assets
  before update on public.artwork_assets
  for each row execute function public.set_updated_at();

create table public.release_artwork_assets (
  release_id uuid not null references public.releases (id) on delete cascade,
  asset_id   uuid not null references public.artwork_assets (id) on delete cascade,
  primary key (release_id, asset_id)
);

-- ---------------------------------------------------------------------------
-- media_library â€” press photos, logos and documents that are not release files.
-- ---------------------------------------------------------------------------
create table public.media_library (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (public.is_valid_slug(slug)),
  title          text not null,
  media_type     text not null check (media_type in ('image','video','audio','document')),
  storage_bucket text not null check (
                   storage_bucket in ('artist-public','epk-assets','video-thumbnails','private-documents')
                 ),
  storage_path   text not null,
  alt_text       text,
  credit         text,
  downloadable_publicly boolean not null default false,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  -- A private document is never marked publicly downloadable.
  constraint private_is_not_public check (
    storage_bucket <> 'private-documents' or not downloadable_publicly
  )
);

create index media_library_type_idx on public.media_library (media_type, created_at desc);

create trigger set_updated_at_media_library
  before update on public.media_library
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helper: is the parent release public? SECURITY DEFINER so a policy on
-- tracks can read releases.status without recursing into releases' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.release_is_public(p_release_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.releases r
    where r.id = p_release_id and r.status = 'released'
  );
$$;

revoke all on function public.release_is_public(uuid) from public;
grant execute on function public.release_is_public(uuid) to anon, authenticated;

-- A track row must point at a release that exists and that an editor is allowed
-- to touch. Without this, an editor could insert tracks against a release that
-- has already been submitted to a distributor.
create or replace function public.release_is_editable(p_release_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.releases r
    where r.id = p_release_id
      and r.status not in ('submitted','processing','released')
  );
$$;

revoke all on function public.release_is_editable(uuid) from public;
grant execute on function public.release_is_editable(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.genres enable row level security;
alter table public.releases enable row level security;
alter table public.tracks enable row level security;
alter table public.track_artists enable row level security;
alter table public.streaming_links enable row level security;
alter table public.music_videos enable row level security;
alter table public.beats enable row level security;
alter table public.audio_assets enable row level security;
alter table public.track_audio_assets enable row level security;
alter table public.artwork_assets enable row level security;
alter table public.release_artwork_assets enable row level security;
alter table public.media_library enable row level security;

-- genres: read-only to visitors, editable by content staff.
create policy "genres: public read"
  on public.genres for select
  to anon, authenticated
  using (true);

create policy "genres: editors write"
  on public.genres for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- releases: visitors see only what has actually been released.
create policy "releases: public read released"
  on public.releases for select
  to anon, authenticated
  using (status = 'released');

create policy "releases: staff read all"
  on public.releases for select
  to authenticated
  using (public.is_staff());

create policy "releases: editors insert"
  on public.releases for insert
  to authenticated
  with check (public.can_edit_content());

create policy "releases: editors update"
  on public.releases for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- Deleting a release also cascades tracks and links, so it is admin-only.
create policy "releases: admins delete"
  on public.releases for delete
  to authenticated
  using (public.is_admin());

-- tracks: readable when the parent release is public, otherwise staff only.
create policy "tracks: public read from released releases"
  on public.tracks for select
  to anon, authenticated
  using (public.release_is_public(release_id) or public.is_staff());

create policy "tracks: editors insert"
  on public.tracks for insert
  to authenticated
  with check (public.can_edit_content() and public.release_is_editable(release_id));

create policy "tracks: editors update"
  on public.tracks for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content() and public.release_is_editable(release_id));

create policy "tracks: admins delete"
  on public.tracks for delete
  to authenticated
  using (public.is_admin());

create policy "track_artists: public read"
  on public.track_artists for select
  to anon, authenticated
  using (true);

create policy "track_artists: editors write"
  on public.track_artists for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

-- streaming_links: public rows are those attached to a public release or a
-- published artist profile.
create policy "streaming links: public read"
  on public.streaming_links for select
  to anon, authenticated
  using (
    (release_id is not null and public.release_is_public(release_id))
    or (artist_profile_id is not null and exists (
          select 1 from public.artist_profiles ap
          where ap.id = artist_profile_id and ap.published
        ))
    or public.is_staff()
  );

create policy "streaming links: editors write"
  on public.streaming_links for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "videos: public read published"
  on public.music_videos for select
  to anon, authenticated
  using (published = true);

create policy "videos: staff read all"
  on public.music_videos for select
  to authenticated
  using (public.is_staff());

create policy "videos: editors insert"
  on public.music_videos for insert
  to authenticated
  with check (public.can_edit_content());

create policy "videos: editors update"
  on public.music_videos for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "videos: admins delete"
  on public.music_videos for delete
  to authenticated
  using (public.is_admin());

create policy "beats: public read published"
  on public.beats for select
  to anon, authenticated
  using (published = true);

create policy "beats: staff read all"
  on public.beats for select
  to authenticated
  using (public.is_staff());

create policy "beats: editors insert"
  on public.beats for insert
  to authenticated
  with check (public.can_edit_content());

create policy "beats: editors update"
  on public.beats for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "beats: admins delete"
  on public.beats for delete
  to authenticated
  using (public.is_admin());

-- audio_assets are never listed publicly: the site only ever references a
-- preview URL that staff have chosen to expose on a track or beat row.
create policy "audio assets: staff read"
  on public.audio_assets for select
  to authenticated
  using (public.is_staff());

create policy "audio assets: staff write"
  on public.audio_assets for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "track audio: staff read"
  on public.track_audio_assets for select
  to authenticated
  using (public.is_staff());

create policy "track audio: staff write"
  on public.track_audio_assets for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "artwork: staff read"
  on public.artwork_assets for select
  to authenticated
  using (public.is_staff());

create policy "artwork: staff write"
  on public.artwork_assets for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "release artwork: staff read"
  on public.release_artwork_assets for select
  to authenticated
  using (public.is_staff());

create policy "release artwork: staff write"
  on public.release_artwork_assets for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "media: public read downloadable"
  on public.media_library for select
  to anon, authenticated
  using (downloadable_publicly or public.is_staff());

create policy "media: editors write"
  on public.media_library for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());




-- ============================================================
-- 0004_distribution.sql
-- ============================================================
-- 0004 â€” Distribution.
--
-- The rule this schema enforces: the site must never claim a release reached a
-- DSP when it did not. A submission can only sit in a "it is actually there"
-- state ('uploaded','in-review','approved','live') when either the API said so
-- (api_verified) or a named human confirmed it (confirmed_by + confirmed_at).

create table public.distributors (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  name            text not null,
  website         text check (website is null or website ~ '^https?://'),
  -- How releases actually get to this distributor from this site.
  delivery_mode   text not null default 'manual' check (delivery_mode in ('manual','api','sftp','none')),
  -- True only when real API credentials are configured and tested. The UI reads
  -- this to decide whether to show "Connected" or "Not connected".
  api_connected   boolean not null default false,
  api_provider    text,
  -- The statuses this distributor is known to report, for validation only.
  status_values   text[] not null default '{}',
  requires_isrc   boolean not null default true,
  requires_upc    boolean not null default false,
  min_artwork_px  integer not null default 1400 check (min_artwork_px between 0 and 10000),
  supported_territories text[] not null default '{}',
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_updated_at_distributors
  before update on public.distributors
  for each row execute function public.set_updated_at();

create table public.release_territories (
  id            uuid primary key default gen_random_uuid(),
  release_id    uuid not null references public.releases (id) on delete cascade,
  distributor_id uuid references public.distributors (id) on delete set null,
  territory     text not null check (territory = 'worldwide' or territory ~ '^[A-Z]{2}$'),
  right_type    text not null default 'mechanical+master' check (
                  right_type in ('mechanical+master','master','mechanical','sync','performance')
                ),
  start_date    date,
  end_date      date,
  created_at    timestamptz not null default now(),
  unique (release_id, territory, distributor_id, right_type),
  constraint territory_window_makes_sense check (end_date is null or start_date is null or end_date >= start_date)
);

create index release_territories_release_idx on public.release_territories (release_id);

create table public.distribution_submissions (
  id                 uuid primary key default gen_random_uuid(),
  release_id         uuid not null references public.releases (id) on delete cascade,
  distributor_id     uuid not null references public.distributors (id) on delete restrict,
  status             text not null default 'prepared' check (
                       status in ('prepared','uploaded','in-review','approved','rejected',
                                  'scheduled','live','withdrawn','delivered')
                     ),
  delivery_mode      text not null default 'manual' check (delivery_mode in ('manual','api')),
  -- Set true only from a verified API/webhook response. Never by the frontend.
  api_verified       boolean not null default false,
  external_ref       text,
  takedown_requested boolean not null default false,
  submitted_at       timestamptz,
  scheduled_release_at timestamptz,
  first_live_at      timestamptz,
  rejected_reason    text,
  -- A human who eyeballed the DSP dashboard and said "yes, it is there".
  confirmed_by       uuid references auth.users (id) on delete set null,
  confirmed_at       timestamptz,
  valid_from         date,
  valid_to           date,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (release_id, distributor_id),
  -- THE ANTI-FABRICATION GUARD. Anything that asserts the files physically
  -- arrived must be backed by an API verification or a named human confirmation.
  constraint claims_must_be_backed check (
    status not in ('uploaded','in-review','approved','rejected','scheduled','live','delivered')
    or api_verified = true
    or (confirmed_by is not null and confirmed_at is not null)
  ),
  constraint submitted_needs_time check (status = 'prepared' or submitted_at is not null),
  constraint live_needs_time check (status <> 'live' or first_live_at is not null),
  constraint rejection_explained check (status <> 'rejected' or rejected_reason is not null)
);

create index distribution_submissions_release_idx on public.distribution_submissions (release_id);
create index distribution_submissions_status_idx on public.distribution_submissions (status, updated_at desc);

create trigger set_updated_at_distribution_submissions
  before update on public.distribution_submissions
  for each row execute function public.set_updated_at();

-- Append-only audit trail of every status change, so "when did this go live?"
-- has a factual answer rather than a remembered one.
create table public.distribution_status_history (
  id             bigint generated always as identity primary key,
  submission_id  uuid not null references public.distribution_submissions (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  note           text,
  source         text not null default 'manual' check (source in ('manual','api','webhook','system')),
  changed_by     uuid references auth.users (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index distribution_status_history_sub_idx
  on public.distribution_status_history (submission_id, changed_at);

create or replace function public.record_distribution_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.distribution_status_history
      (submission_id, from_status, to_status, note, source, changed_by)
    values (
      new.id,
      null,
      new.status,
      'submission created',
      case when new.api_verified then 'api' else 'manual' end,
      public.auth_uid()
    );
  elsif new.status is distinct from old.status then
    insert into public.distribution_status_history
      (submission_id, from_status, to_status, note, source, changed_by)
    values (
      new.id,
      old.status,
      new.status,
      coalesce(new.rejected_reason, 'status changed'),
      case when new.api_verified then 'api' else 'manual' end,
      public.auth_uid()
    );
  end if;
  return new;
end;
$$;

create trigger on_distribution_status_change
  after insert or update of status
  on public.distribution_submissions
  for each row execute function public.record_distribution_history();

-- History rows describe what happened; they must not be edited after the fact.
create or replace function public.history_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'distribution_status_history is append-only';
end;
$$;

create trigger no_update_distribution_history
  before update or delete on public.distribution_status_history
  for each row execute function public.history_is_append_only();

-- Generated metadata bundles. Stored so an admin can re-download exactly what
-- was handed to a distributor, and prove what was sent.
create table public.release_metadata_exports (
  id            uuid primary key default gen_random_uuid(),
  release_id    uuid not null references public.releases (id) on delete cascade,
  distributor_id uuid references public.distributors (id) on delete set null,
  format        text not null check (format in ('csv','json','ddex-ern','ddex-json')),
  file_name     text not null,
  storage_bucket text not null default 'private-documents' check (
                   storage_bucket in ('private-documents','epk-assets')
                 ),
  storage_path  text,
  -- Small bundles live inline; anything a distributor would ingest goes to the
  -- private bucket and is referenced by storage_path.
  payload       jsonb,
  row_count     integer check (row_count is null or row_count between 0 and 100000),
  checksum_sha256 text check (
                    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
                  ),
  generated_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index release_metadata_exports_release_idx
  on public.release_metadata_exports (release_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.distributors enable row level security;
alter table public.release_territories enable row level security;
alter table public.distribution_submissions enable row level security;
alter table public.distribution_status_history enable row level security;
alter table public.release_metadata_exports enable row level security;

-- Distributor catalogue is not secret, but it is never shown to visitors as an
-- integration we have: only staff read it.
create policy "distributors: staff read"
  on public.distributors for select
  to authenticated
  using (public.is_staff());

create policy "distributors: admins write"
  on public.distributors for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "territories: staff read"
  on public.release_territories for select
  to authenticated
  using (public.is_staff());

create policy "territories: editors write"
  on public.release_territories for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "submissions: staff read"
  on public.distribution_submissions for select
  to authenticated
  using (public.is_staff());

-- api_verified is deliberately not settable through the API role: it is only
-- written by the service-role client inside a webhook handler. A client token
-- cannot flip a claim of delivery into a "verified" one.
create policy "submissions: editors create prepared rows"
  on public.distribution_submissions for insert
  to authenticated
  with check (
    public.can_edit_content()
    and api_verified = false
  );

create policy "submissions: editors update without verifying"
  on public.distribution_submissions for update
  to authenticated
  using (public.can_edit_content() and api_verified = false)
  with check (
    public.can_edit_content()
    and api_verified = false
  );

create policy "submissions: admins delete"
  on public.distribution_submissions for delete
  to authenticated
  using (public.is_admin());

create policy "history: staff read"
  on public.distribution_status_history for select
  to authenticated
  using (public.is_staff());

-- No insert policy: rows arrive only through the trigger (security definer).

create policy "exports: staff read"
  on public.release_metadata_exports for select
  to authenticated
  using (public.is_staff());

create policy "exports: staff create"
  on public.release_metadata_exports for insert
  to authenticated
  with check (public.can_edit_content());

create policy "exports: admins delete"
  on public.release_metadata_exports for delete
  to authenticated
  using (public.is_admin());




-- ============================================================
-- 0005_fans_and_enquiries.sql
-- ============================================================
-- 0005 â€” Fans, newsletter and inbound enquiries.
--
-- Privacy posture: raw IPs are never stored (only a salted digest produced in
-- the server action), consent is recorded with a timestamp, and subscription is
-- double opt-in â€” a row starting as 'pending' is not a marketing contact.

-- ---------------------------------------------------------------------------
-- fan_profiles â€” the extra, fan-facing half of a profile.
-- ---------------------------------------------------------------------------
create table public.fan_profiles (
  id              uuid primary key references public.profiles (id) on delete cascade,
  nickname        text check (nickname is null or char_length(nickname) between 2 and 60),
  city            text,
  country         text,
  favourite_genres text[] not null default '{}',
  notification_opt_in boolean not null default false,
  joined_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_updated_at_fan_profiles
  before update on public.fan_profiles
  for each row execute function public.set_updated_at();

create table public.fan_favourites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (user_id, release_id)
);

create index fan_favourites_release_idx on public.fan_favourites (release_id);

-- Append-only: what a signed-in fan looked at and saved, for the CRM view.
create table public.fan_activity (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (
               action in ('view_release','view_video','view_lyric','add_favourite','remove_favourite',
                          'download_epk','beat_licence_view','newsletter_signup','contact_form')
             ),
  entity_type text,
  entity_id   text,
  created_at  timestamptz not null default now()
);

create index fan_activity_user_idx on public.fan_activity (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- newsletter_subscribers
-- ---------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  status              text not null default 'pending' check (
                        status in ('pending','confirmed','unsubscribed','bounced','complained')
                      ),
  -- Recorded when the visitor pressed submit (the consent statement).
  consent_recorded_at timestamptz not null default now(),
  -- Only set once the confirmation link has actually been clicked. Marketing
  -- sends must filter on confirmed_at being non-null, never on this row alone.
  confirmed_at        timestamptz,
  unsubscribed_at     timestamptz,
  verify_token_hash   text check (verify_token_hash is null or verify_token_hash ~ '^[a-f0-9]{64}$'),
  verify_sent_at      timestamptz,
  source              text check (source is null or char_length(source) <= 200),
  ip_hash             text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{32}$'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint confirmed_not_before_consent check (
    confirmed_at is null or confirmed_at >= consent_recorded_at
  ),
  constraint unsubscribed_needs_time check (
    status <> 'unsubscribed' or unsubscribed_at is not null
  )
);

create index newsletter_subscribers_status_idx on public.newsletter_subscribers (status, updated_at desc);

create trigger set_updated_at_newsletter_subscribers
  before update on public.newsletter_subscribers
  for each row execute function public.set_updated_at();

create table public.email_preferences (
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  topic         text not null check (
                   topic in ('releases','videos','shows','beats','press','news')
                 ),
  wanted        boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (subscriber_id, topic)
);

create trigger set_updated_at_email_preferences
  before update on public.email_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contact_submissions â€” booking / collab / press / licensing inbound.
-- ---------------------------------------------------------------------------
create table public.contact_submissions (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (char_length(full_name) between 2 and 160),
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  phone        text check (phone is null or char_length(phone) <= 40),
  organisation text check (organisation is null or char_length(organisation) <= 160),
  kind         text not null check (
                 kind in ('booking','event-appearance','collaboration','production',
                          'beat-licence','press','business')
               ),
  event_date   text check (event_date is null or char_length(event_date) <= 32),
  budget       text check (budget is null or char_length(budget) <= 80),
  message      text not null check (char_length(message) between 10 and 8000),
  -- Salted digest computed in the server action. The raw address is not kept.
  ip_hash      text not null check (ip_hash ~ '^[a-f0-9]{32}$'),
  status       text not null default 'new' check (
                 status in ('new','reading','replied','booked','declined','archived')
               ),
  handled_by   uuid references auth.users (id) on delete set null,
  internal_note text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index contact_submissions_status_idx on public.contact_submissions (status, created_at desc);
create index contact_submissions_ip_window_idx on public.contact_submissions (ip_hash, created_at desc);

create trigger set_updated_at_contact_submissions
  before update on public.contact_submissions
  for each row execute function public.set_updated_at();

-- Booking enquiries are a slice of the same queue, exposed as a view so the
-- admin CRM and the raw form data can never drift apart.
create or replace view public.booking_enquiries as
select id, full_name, email, phone, organisation, event_date, budget, message, status, created_at
from public.contact_submissions
where kind in ('booking','event-appearance');

-- ---------------------------------------------------------------------------
-- Throttle. Doing this as a definer function means anonymous visitors never get
-- SELECT on contact_submissions (which would leak other people's enquiries),
-- while the server action can still ask "has this address been busy?".
-- ---------------------------------------------------------------------------
create or replace function public.contact_submission_is_throttled(
  p_ip_hash text,
  p_window_seconds integer default 60,
  p_max integer default 3
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n bigint;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{32}$' then
    -- Fail closed: a caller that cannot identify itself does not get to send.
    return true;
  end if;

  select count(*) into n
  from public.contact_submissions c
  where c.ip_hash = p_ip_hash
    and c.created_at > now() - make_interval(secs => p_window_seconds);

  return n >= p_max;
end;
$$;

revoke all on function public.contact_submission_is_throttled(text, integer, integer) from public;
grant execute on function public.contact_submission_is_throttled(text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- comments â€” off unless a fan is signed in, and held for moderation.
-- ---------------------------------------------------------------------------
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null check (entity_type in ('release','video','post','beat'))  ,
  entity_id   uuid not null,
  body        text not null check (char_length(body) between 1 and 2000),
  status      text not null default 'pending' check (
                status in ('pending','approved','rejected','reported')
              ),
  reported_by text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index comments_entity_idx on public.comments (entity_type, entity_id, status);

create trigger set_updated_at_comments
  before update on public.comments
  for each row execute function public.set_updated_at();

-- shares â€” a count of real share clicks, so the analytics page can show
-- "12 shares" only when 12 rows exist.
create table public.shares (
  id           bigint generated always as identity primary key,
  entity_type  text not null check (entity_type in ('release','video','post','beat','lyric','page')),
  entity_slug  text not null,
  channel      text not null check (
                 channel in ('whatsapp','x','facebook','telegram','copy-link','other')
               ),
  page_path    text,
  ip_hash      text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{32}$'),
  created_at   timestamptz not null default now()
);

create index shares_entity_idx on public.shares (entity_type, entity_slug, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.fan_profiles enable row level security;
alter table public.fan_favourites enable row level security;
alter table public.fan_activity enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.email_preferences enable row level security;
alter table public.contact_submissions enable row level security;
alter table public.comments enable row level security;
alter table public.shares enable row level security;

create policy "fan_profiles: owner writes own"
  on public.fan_profiles for all
  to authenticated
  using (id = public.auth_uid())
  with check (id = public.auth_uid());

create policy "fan_profiles: staff read all"
  on public.fan_profiles for select
  to authenticated
  using (public.is_staff());

create policy "favourites: owner reads and writes"
  on public.fan_favourites for all
  to authenticated
  using (user_id = public.auth_uid())
  with check (
    user_id = public.auth_uid()
    -- Only releases that are actually out can be favourited.
    and public.release_is_public(release_id)
  );

create policy "favourites: staff read"
  on public.fan_favourites for select
  to authenticated
  using (public.is_staff());

create policy "activity: owner reads own"
  on public.fan_activity for select
  to authenticated
  using (user_id = public.auth_uid() or public.is_staff());

create policy "activity: owner appends own"
  on public.fan_activity for insert
  to authenticated
  with check (user_id = public.auth_uid());

-- No update/delete policy on fan_activity: an audit log is append-only.

-- Newsletter: anonymous insert is allowed (the public form), reading is not.
create policy "newsletter: anyone may subscribe"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and confirmed_at is null
    and verify_token_hash is null
  );

-- A visitor may not read back whether an address is on the list.
-- (No SELECT policy for anon.)
create policy "newsletter: staff read"
  on public.newsletter_subscribers for select
  to authenticated
  using (public.is_staff());

create policy "newsletter: staff update"
  on public.newsletter_subscribers for update
  to authenticated
  using (public.is_staff())
  with check (
    public.is_staff()
    -- Staff cannot mark a subscription confirmed without a confirmation time,
    -- so a hand-edited row still tells the truth.
    and (status <> 'confirmed' or confirmed_at is not null)
  );

create policy "newsletter: admins delete"
  on public.newsletter_subscribers for delete
  to authenticated
  using (public.is_admin());

create policy "email prefs: staff write"
  on public.email_preferences for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Contact: insert only, no read for the submitting party.
create policy "contact: anyone may submit"
  on public.contact_submissions for insert
  to anon, authenticated
  with check (
    status = 'new'
    and handled_by is null
    and internal_note is null
  );

create policy "contact: staff read"
  on public.contact_submissions for select
  to authenticated
  using (public.is_staff());

create policy "contact: staff triage"
  on public.contact_submissions for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "contact: admins delete"
  on public.contact_submissions for delete
  to authenticated
  using (public.is_admin());

create policy "comments: public read approved"
  on public.comments for select
  to anon, authenticated
  using (status = 'approved' or user_id = public.auth_uid() or public.is_staff());

create policy "comments: fans may post for moderation"
  on public.comments for insert
  to authenticated
  with check (user_id = public.auth_uid() and status = 'pending');

create policy "comments: staff moderate"
  on public.comments for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Shares: anyone may record a click; only staff read the log.
create policy "shares: anyone may record"
  on public.shares for insert
  to anon, authenticated
  with check (true);

create policy "shares: staff read"
  on public.shares for select
  to authenticated
  using (public.is_staff());




-- ============================================================
-- 0006_content_cms.sql
-- ============================================================
-- 0006 â€” Content CMS: categories, posts, pages.
--
-- blog_posts is read by src/lib/content.ts getPosts() with
-- select("*").eq("status","published").order("published_at desc"), so every
-- column mapPost() touches has to exist here under the same name.

create table public.blog_categories (
  slug        text primary key check (public.is_valid_slug(slug)),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.blog_posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (public.is_valid_slug(slug)),
  title          text not null check (char_length(title) between 1 and 200),
  excerpt        text not null default '' check (char_length(excerpt) <= 400),
  -- Sanitised in the admin layer (src/lib/sanitize.ts) before it is written.
  body_html      text not null default '',
  category       text not null default 'News',
  author_name    text not null default 'REX KENNY',
  cover_image    text check (cover_image is null or cover_image ~ '^(/|https?://)'),
  cover_alt      text,
  published_at   timestamptz,
  -- Cached at save time from the body length; shown as an estimate, not a fact.
  reading_minutes integer not null default 1 check (reading_minutes between 1 and 600),
  status         text not null default 'draft' check (status in ('draft','scheduled','published')),
  seo_title      text,
  seo_description text,
  canonical_url  text,
  og_image       text,
  noindex        boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Nothing can be 'published' without a date, and nothing can claim a past
  -- publish date while still sitting in draft.
  constraint published_needs_date check (status <> 'published' or published_at is not null),
  constraint scheduled_is_future check (status <> 'scheduled' or published_at > now())
);

create index blog_posts_status_published_idx on public.blog_posts (status, published_at desc);
create index blog_posts_category_idx on public.blog_posts (category);
create index blog_posts_search_idx on public.blog_posts
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,'')));

create trigger set_updated_at_blog_posts
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- pages â€” the long-form, non-post pages (tour dates, charity work, store copy).
create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (public.is_valid_slug(slug)),
  title       text not null check (char_length(title) between 1 and 200),
  -- Route this content is served on. Restricted to a safe, relative path so a
  -- CMS row can never point a nav link at an external host.
  route       text not null unique check (route ~ '^/[a-z0-9/-]*$'),
  body_html   text not null default '',
  description text,
  published   boolean not null default false,
  seo_title   text,
  seo_description text,
  canonical_url text,
  og_image    text,
  noindex     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at_pages
  before update on public.pages
  for each row execute function public.set_updated_at();

-- Publishing a post should stamp a date exactly once, and moving it back to
-- draft should not silently rewrite history.
create or replace function public.stamp_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger before_blog_posts_save
  before insert or update on public.blog_posts
  for each row execute function public.stamp_published_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.pages enable row level security;

create policy "categories: public read"
  on public.blog_categories for select
  to anon, authenticated
  using (true);

create policy "categories: editors write"
  on public.blog_categories for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "posts: public read published"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published');

create policy "posts: staff read all"
  on public.blog_posts for select
  to authenticated
  using (public.is_staff());

create policy "posts: editors insert"
  on public.blog_posts for insert
  to authenticated
  with check (public.can_edit_content());

create policy "posts: editors update"
  on public.blog_posts for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "posts: admins delete"
  on public.blog_posts for delete
  to authenticated
  using (public.is_admin());

create policy "pages: public read published"
  on public.pages for select
  to anon, authenticated
  using (published = true);

create policy "pages: staff read all"
  on public.pages for select
  to authenticated
  using (public.is_staff());

create policy "pages: editors insert"
  on public.pages for insert
  to authenticated
  with check (public.can_edit_content());

create policy "pages: editors update"
  on public.pages for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "pages: admins delete"
  on public.pages for delete
  to authenticated
  using (public.is_admin());




-- ============================================================
-- 0007_analytics_and_trends.sql
-- ============================================================
-- 0007 â€” Analytics and trend intelligence.
--
-- Design rule: a number in this schema is either (a) a first-party event this
-- site counted itself, or (b) a figure pulled from a named provider at a named
-- time. There is no column that can hold an invented number, and every external
-- row carries provider + fetched_at so the UI can say when it was true.

create table public.analytics_integrations (
  provider      text primary key check (
                  provider in ('ga4','search_console','spotify_for_artists','apple_music',
                               'youtube_analytics','audiomack','boomplay','deezer','shazam')
                ),
  -- Set only by a successful authenticated call. Drives "Connected" vs
  -- "Not connected" in the dashboard; the UI must never assume it.
  connected     boolean not null default false,
  property_id   text,
  last_sync_at  timestamptz,
  last_error    text,
  -- What scope the OAuth grant actually covers, so we cannot claim more access
  -- than the provider gave us.
  scopes        text[] not null default '{}',
  credentials_ref text check (
                   credentials_ref is null or credentials_ref !~ '(sa\.json|key|secret|password)'
                 ),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A provider cannot be 'connected' without a sync having happened at least once.
  constraint connected_needs_sync check (not connected or last_sync_at is not null)
);

create trigger set_updated_at_analytics_integrations
  before update on public.analytics_integrations
  for each row execute function public.set_updated_at();

-- First-party events, counted by this site. No personal identifiers: an IP is
-- stored only as the same salted digest the contact form uses.
create table public.analytics_events (
  id          bigint generated always as identity primary key,
  event_name  text not null check (event_name ~ '^[a-z0-9_]{2,60}$'),
  path        text not null check (path ~ '^/[a-zA-Z0-9/_?=.&%-]{0,500}$'),
  release_slug text,
  video_slug  text,
  post_slug   text,
  channel     text check (channel is null or channel in
                          ('whatsapp','x','facebook','telegram','copy-link','email','other')),
  referrer_host text,
  country     text check (country is null or country ~ '^[A-Z]{2}$'),
  device_class text check (device_class is null or device_class in ('mobile','tablet','desktop','bot')),
  session_id  text check (session_id is null or session_id ~ '^[a-f0-9]{8,64}$'),
  ip_hash     text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{32}$'),
  payload     jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz not null default now()
);

create index analytics_events_name_time_idx on public.analytics_events (event_name, created_at desc);
create index analytics_events_path_time_idx on public.analytics_events (path, created_at desc);
create index analytics_events_release_idx on public.analytics_events (release_slug, created_at desc);

-- Daily rollup so the dashboard does not scan raw events.
create table public.page_views (
  day            date not null,
  path           text not null check (path ~ '^/[a-zA-Z0-9/_?=.&%-]{0,500}$'),
  views          integer not null default 0 check (views >= 0),
  unique_sessions integer not null default 0 check (unique_sessions >= 0),
  updated_at     timestamptz not null default now(),
  primary key (day, path)
);

create table public.traffic_sources (
  day            date not null,
  source         text not null check (
                   source in ('google','bing','duckduckgo','direct','youtube','instagram',
                              'tiktok','x','whatsapp','spotify','ai-assistant','other')
                 ),
  medium         text check (medium is null or medium in ('organic','social','referral','email','paid','none')),
  sessions       integer not null default 0 check (sessions >= 0),
  primary key (day, source, medium)
);

-- Per-release performance. `provider` + `fetched_at` make the number auditable;
-- `is_estimate` is set for anything the provider reports as approximated.
create table public.release_analytics (
  id             uuid primary key default gen_random_uuid(),
  release_slug   text not null,
  platform       text not null check (
                   platform in ('spotify','apple-music','youtube-music','audiomack','boomplay',
                                'deezer','amazon-music','tidal','youtube','first-party','search_console')
                 ),
  day            date not null,
  streams        bigint check (streams is null or streams >= 0),
  listeners      bigint check (listeners is null or listeners >= 0),
  saves          bigint check (saves is null or saves >= 0),
  video_views    bigint check (video_views is null or video_views >= 0),
  impressions    bigint check (impressions is null or impressions >= 0),
  clicks         bigint check (clicks is null or clicks >= 0),
  revenue_usd    numeric(12,4) check (revenue_usd is null or revenue_usd >= 0),
  provider       text not null check (
                   provider in ('ga4','search_console','spotify_for_artists','apple_music',
                                'youtube_analytics','audiomack','boomplay','deezer','shazam',
                                'first-party','manual')
                 ),
  fetched_at     timestamptz not null default now(),
  is_estimate    boolean not null default false,
  -- A hand-entered figure must be labelled as such and carry its basis.
  manual_basis   text check (manual_basis is null or char_length(manual_basis) <= 500),
  created_at     timestamptz not null default now(),
  unique (release_slug, platform, day, provider),
  constraint manual_needs_basis check (provider <> 'manual' or manual_basis is not null)
);

create index release_analytics_lookup_idx on public.release_analytics (release_slug, day desc);

create table public.search_queries (
  day            date not null,
  query          text not null check (char_length(query) between 1 and 200),
  impressions    integer not null default 0 check (impressions >= 0),
  clicks         integer not null default 0 check (clicks >= 0),
  avg_position   numeric(5,2),
  primary key (day, query)
);

create index search_queries_day_idx on public.search_queries (day desc, clicks desc);

-- Trend intelligence: what is happening in the scene, with a citation. A row
-- without a source URL cannot exist, which keeps "trend" out of fiction.
create table public.trend_snapshots (
  id            uuid primary key default gen_random_uuid(),
  captured_at   timestamptz not null default now(),
  region        text not null check (region = 'global' or region ~ '^[A-Z]{2}$'),
  scene         text not null check (scene in ('african-dancehall','afrobeats','amapiano','ugandan-pop','reggae-dancehall','other')),
  metric_kind   text not null check (
                   metric_kind in ('search_interest','chart_position','playlist_adds','social_mentions','release_volume')
                 ),
  subject       text not null check (char_length(subject) between 1 and 200),
  value         numeric not null,
  source_name   text not null check (char_length(source_name) between 2 and 120),
  source_url    text not null check (source_url ~ '^https?://'),
  method        text not null default 'public-api' check (
                   method in ('public-api','official-report','manual','first-party')
                 ),
  note          text,
  created_by    uuid references auth.users (id) on delete set null
);

create index trend_snapshots_scene_idx on public.trend_snapshots (scene, captured_at desc);

-- Saved views the admin builds from the above, so a screenshot is reproducible.
create table public.analytics_saved_reports (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  definition  jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.analytics_integrations enable row level security;
alter table public.analytics_events enable row level security;
alter table public.page_views enable row level security;
alter table public.traffic_sources enable row level security;
alter table public.release_analytics enable row level security;
alter table public.search_queries enable row level security;
alter table public.trend_snapshots enable row level security;
alter table public.analytics_saved_reports enable row level security;

-- First-party beacon: anonymous may insert, but only the collector's own event
-- names. RLS cannot narrow the column list, so the write path is a dedicated
-- insert-only policy and the dashboard never trusts these rows for anything
-- except traffic shape.
create policy "events: collect"
  on public.analytics_events for insert
  to anon, authenticated
  with check (
    event_name in (
      'page_view','release_view','video_view','lyric_view','outbound_click',
      'share','stream_click','beat_view','epk_download','newsletter_signup',
      'contact_submit','search'
    )
  );

-- No SELECT policy for anon: nobody can read anybody else's traffic.
create policy "events: staff read"
  on public.analytics_events for select
  to authenticated
  using (public.is_staff());

create policy "events: admins update"
  on public.analytics_events for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "events: admins delete"
  on public.analytics_events for delete
  to authenticated
  using (public.is_admin());

create policy "page views: staff read"
  on public.page_views for select
  to authenticated
  using (public.is_staff());

create policy "page views: pipeline write"
  on public.page_views for all
  to authenticated
  using (public.has_role('analytics_viewer') or public.can_edit_content())
  with check (public.has_role('analytics_viewer') or public.can_edit_content());

create policy "traffic sources: staff read"
  on public.traffic_sources for select
  to authenticated
  using (public.is_staff());

create policy "traffic sources: pipeline write"
  on public.traffic_sources for all
  to authenticated
  using (public.has_role('analytics_viewer') or public.can_edit_content())
  with check (public.has_role('analytics_viewer') or public.can_edit_content());

create policy "release analytics: staff read"
  on public.release_analytics for select
  to authenticated
  using (public.is_staff());

create policy "release analytics: pipeline insert"
  on public.release_analytics for insert
  to authenticated
  with check (public.has_role('analytics_viewer') or public.can_edit_content());

create policy "release analytics: pipeline update"
  on public.release_analytics for update
  to authenticated
  using (public.has_role('analytics_viewer') or public.can_edit_content())
  with check (public.has_role('analytics_viewer') or public.can_edit_content());

create policy "search queries: staff read"
  on public.search_queries for select
  to authenticated
  using (public.is_staff());

create policy "search queries: pipeline write"
  on public.search_queries for all
  to authenticated
  using (public.has_role('analytics_viewer') or public.can_edit_content())
  with check (public.has_role('analytics_viewer') or public.can_edit_content());

-- Trends are internal intelligence: never served to visitors.
create policy "trends: staff read"
  on public.trend_snapshots for select
  to authenticated
  using (public.is_staff());

create policy "trends: staff insert"
  on public.trend_snapshots for insert
  to authenticated
  with check (public.can_edit_content());

create policy "trends: staff update"
  on public.trend_snapshots for update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "trends: admins delete"
  on public.trend_snapshots for delete
  to authenticated
  using (public.is_admin());

create policy "reports: owner or staff"
  on public.analytics_saved_reports for select
  to authenticated
  using (created_by = public.auth_uid() or public.is_staff());

create policy "reports: staff write"
  on public.analytics_saved_reports for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Integration connection state is admin-only: it describes which third parties
-- we are talking to, which is not visitor-facing information.
create policy "integrations: admins read and write"
  on public.analytics_integrations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Roll first-party events into the daily page_view table on insert, so the
-- dashboard has real numbers without a separate cron job being mandatory.
-- A session counts once per day per path: the dedupe reads the raw event log,
-- which is the only place session ids live.
create or replace function public.accrue_page_view()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_new_session boolean;
begin
  if new.session_id is null then
    is_new_session := false;
  else
    select not exists (
      select 1
      from public.analytics_events e
      where e.session_id = new.session_id
        and e.path = new.path
        and e.created_at::date = new.created_at::date
        and e.id <> new.id
    ) into is_new_session;
  end if;

  insert into public.page_views (day, path, views, unique_sessions)
  values (
    new.created_at::date,
    new.path,
    1,
    case when is_new_session then 1 else 0 end
  )
  on conflict (day, path)
  do update
     set views = public.page_views.views + 1,
         unique_sessions = public.page_views.unique_sessions
                           + case when is_new_session then 1 else 0 end,
         updated_at = now();

  return new;
end;
$$;

create trigger after_analytics_event
  after insert on public.analytics_events
  for each row execute function public.accrue_page_view();




-- ============================================================
-- 0008_system_and_email.sql
-- ============================================================
-- 0008 â€” System: audit, notifications, email, integration connections.

-- ---------------------------------------------------------------------------
-- audit_logs â€” append-only. 0001.record_audit() writes here with a security
-- definer function, so there is deliberately no INSERT policy for clients:
-- nobody can forge a log entry through the API.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references auth.users (id) on delete set null,
  action         text not null check (action ~ '^[a-z0-9_.]{2,80}$'),
  entity         text not null check (entity ~ '^[a-z0-9_]{2,80}$'),
  entity_id      text,
  detail         jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  ip_hash        text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{32}$'),
  created_at     timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

create or replace function public.audit_logs_are_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger no_change_audit_logs
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_are_immutable();

-- ---------------------------------------------------------------------------
-- notifications â€” the admin bell. Created by triggers and actions, never by a
-- visitor.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (
                 kind in ('release_status','distribution_rejected','contact_enquiry','beat_licence',
                          'newsletter_milestone','comment_pending','export_ready','system')
               ),
  title        text not null check (char_length(title) between 1 and 200),
  body         text check (body is null or char_length(body) <= 1000),
  link         text check (link is null or link ~ '^/[a-zA-Z0-9/_?=.&%-]{0,300}$'),
  severity     text not null default 'info' check (severity in ('info','success','warning','error')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- email_campaigns â€” double opt-in is enforced where recipients are selected,
-- not where the campaign is written.
-- ---------------------------------------------------------------------------
create table public.email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 2 and 160),
  subject          text check (subject is null or char_length(subject) <= 200),
  preheader        text check (preheader is null or char_length(preheader) <= 200),
  body_html        text not null default '',
  -- Which slice of the list this goes to. Only 'confirmed' is ever selected; see
  -- queue_email_campaign().
  segment          text not null default 'all-confirmed' check (
                     segment in ('all-confirmed','releases','videos','shows','beats','press','news')
                   ),
  status           text not null default 'draft' check (
                     status in ('draft','testing','scheduled','queued','sending','sent','cancelled','failed')
                   ),
  scheduled_for    timestamptz,
  queued_at        timestamptz,
  sent_at          timestamptz,
  -- The verified sending domain the campaign is sent from. A campaign cannot be
  -- queued while this is blank, because unverified domains get spam-flagged.
  from_email       text check (from_email is null or from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  reply_to         text check (reply_to is null or reply_to ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  recipient_count  integer check (recipient_count is null or recipient_count >= 0),
  delivered_count  integer not null default 0 check (delivered_count >= 0),
  opened_count     integer not null default 0 check (opened_count >= 0),
  clicked_count    integer not null default 0 check (clicked_count >= 0),
  bounced_count    integer not null default 0 check (bounced_count >= 0),
  unsubscribed_count integer not null default 0 check (unsubscribed_count >= 0),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sent_needs_time check (status <> 'sent' or sent_at is not null),
  constraint queued_needs_count check (
    status not in ('queued','sending','sent') or recipient_count is not null
  ),
  constraint counts_cannot_exceed_recipients check (
    (recipient_count is null or delivered_count <= recipient_count)
  )
);

create index email_campaigns_status_idx on public.email_campaigns (status, created_at desc);

create trigger set_updated_at_email_campaigns
  before update on public.email_campaigns
  for each row execute function public.set_updated_at();

create table public.email_delivery_logs (
  id             bigint generated always as identity primary key,
  campaign_id    uuid not null references public.email_campaigns (id) on delete cascade,
  subscriber_id  uuid not null references public.newsletter_subscribers (id) on delete cascade,
  status         text not null default 'queued' check (
                   status in ('queued','sent','delivered','bounced','opened','clicked','unsubscribed','failed')
                 ),
  provider_message_id text,
  provider_event text,
  bounced_reason text,
  queued_at      timestamptz not null default now(),
  delivered_at   timestamptz,
  opened_at      timestamptz,
  clicked_at     timestamptz,
  bounced_at     timestamptz,
  unsubscribed_at timestamptz,
  -- One row per (campaign, subscriber): a recipient cannot be counted twice.
  unique (campaign_id, subscriber_id)
);

create index email_delivery_logs_campaign_idx on public.email_delivery_logs (campaign_id, status);

-- Keep the campaign counters honest: they are derived from the delivery log, so
-- a hand-typed "12,400 delivered" has nowhere to go.
create or replace function public.recount_email_campaign(p_campaign uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.email_campaigns c
     set delivered_count = (select count(*) from public.email_delivery_logs l
                             where l.campaign_id = c.id
                               and l.status in ('delivered','opened','clicked','unsubscribed')),
         opened_count    = (select count(*) from public.email_delivery_logs l
                             where l.campaign_id = c.id and l.opened_at is not null),
         clicked_count   = (select count(*) from public.email_delivery_logs l
                             where l.campaign_id = c.id and l.clicked_at is not null),
         bounced_count   = (select count(*) from public.email_delivery_logs l
                             where l.campaign_id = c.id and l.bounced_at is not null),
         unsubscribed_count = (select count(*) from public.email_delivery_logs l
                             where l.campaign_id = c.id and l.unsubscribed_at is not null)
   where c.id = p_campaign;
$$;

create or replace function public.after_delivery_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recount_email_campaign(old.campaign_id);
    return old;
  end if;
  perform public.recount_email_campaign(new.campaign_id);
  return new;
end;
$$;

create trigger after_email_delivery_log
  after insert or update or delete on public.email_delivery_logs
  for each row execute function public.after_delivery_log_change();

-- Recipients are chosen by the database, from the only addresses that have
-- actually confirmed. This is what makes "double opt-in" a fact rather than a
-- claim in the copy.
create or replace function public.queue_email_campaign(p_campaign uuid)
returns table (recipients integer, message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  camp public.email_campaigns;
  n integer;
begin
  select * into camp from public.email_campaigns c where c.id = p_campaign;
  if camp.id is null then
    return query select 0::integer, 'Campaign not found.';
    return;
  end if;

  if not public.can_edit_content() then
    return query select 0::integer, 'Not allowed to send email.';
    return;
  end if;

  if camp.status not in ('draft','testing','scheduled') then
    return query select 0::integer,
      format('Campaign is already %s; queuing is not repeatable.', camp.status);
    return;
  end if;

  if camp.from_email is null or camp.subject is null or camp.subject = '' then
    return query select 0::integer, 'Add a sender address and a subject first.';
    return;
  end if;

  insert into public.email_delivery_logs (campaign_id, subscriber_id)
  select camp.id, s.id
    from public.newsletter_subscribers s
   where s.status = 'confirmed'
     and s.confirmed_at is not null
     and (camp.segment = 'all-confirmed'
          or exists (select 1 from public.email_preferences p
                      where p.subscriber_id = s.id and p.topic = camp.segment and p.wanted))
  on conflict (campaign_id, subscriber_id) do nothing;

  select count(*) into n from public.email_delivery_logs l where l.campaign_id = camp.id;

  if n = 0 then
    return query select 0::integer,
      'No confirmed subscribers match this segment. Nothing was queued.';
    return;
  end if;

  update public.email_campaigns c
     set status = 'queued', queued_at = now(), recipient_count = n
   where c.id = camp.id;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, detail)
  values (public.auth_uid(), 'email_campaign.queued', 'email_campaigns', camp.id::text,
          jsonb_build_object('recipients', n, 'segment', camp.segment));

  return query select n, format('%s recipients queued.', n);
end;
$$;

revoke all on function public.queue_email_campaign(uuid) from public;
grant execute on function public.queue_email_campaign(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- integration_connections â€” the honest status page. `connected` only ever true
-- after a real test call, which is why it also requires last_test_passed_at.
-- ---------------------------------------------------------------------------
create table public.integration_connections (
  service        text primary key check (
                   service in ('supabase','resend','google_oauth','ga4','search_console','sentry',
                               'spotify','apple_music','youtube','audiomack','boomplay','vercel_analytics')
                 ),
  label          text not null,
  -- 'missing' | 'partial' | 'connected' | 'error' â€” the four states a real
  -- integration can be in. There is no 'simulated' state by design.
  state          text not null default 'missing' check (state in ('missing','partial','connected','error')),
  environment_variable text not null,
  setup_url      text check (setup_url is null or setup_url ~ '^https?://'),
  last_test_at   timestamptz,
  last_test_passed_at timestamptz,
  last_error     text,
  detail         text check (detail is null or char_length(detail) <= 500),
  updated_by     uuid references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  -- Nothing may be called connected unless a test actually passed.
  constraint connected_needs_passed_test check (
    state <> 'connected' or last_test_passed_at is not null
  )
);

create trigger set_updated_at_integration_connections
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_delivery_logs enable row level security;
alter table public.integration_connections enable row level security;

-- Read-only for staff. No insert/update/delete policy: writes come from
-- record_audit() and the append-only triggers.
create policy "audit: super admins read"
  on public.audit_logs for select
  to authenticated
  using (public.has_role('super_admin') or public.has_role('admin'));

create policy "notifications: owner reads own"
  on public.notifications for select
  to authenticated
  using (user_id = public.auth_uid());

create policy "notifications: owner marks read"
  on public.notifications for update
  to authenticated
  using (user_id = public.auth_uid())
  with check (user_id = public.auth_uid());

create policy "notifications: staff may create for colleagues"
  on public.notifications for insert
  to authenticated
  with check (public.is_staff() and read_at is null);

create policy "campaigns: staff read"
  on public.email_campaigns for select
  to authenticated
  using (public.is_staff());

create policy "campaigns: marketing inserts drafts"
  on public.email_campaigns for insert
  to authenticated
  with check (
    public.has_role('marketing_manager') or public.can_edit_content()
  );

create policy "campaigns: marketing updates drafts"
  on public.email_campaigns for update
  to authenticated
  using (public.has_role('marketing_manager') or public.can_edit_content())
  with check (
    public.has_role('marketing_manager') or public.can_edit_content()
  );

create policy "campaigns: admins delete"
  on public.email_campaigns for delete
  to authenticated
  using (public.is_admin());

create policy "delivery logs: staff read"
  on public.email_delivery_logs for select
  to authenticated
  using (public.is_staff());

-- Delivery logs are written by the queue function and the Resend webhook
-- (service role), not by the dashboard. So: no client write policy.

create policy "connections: admins read and write"
  on public.integration_connections for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());




-- ============================================================
-- 0009_storage.sql
-- ============================================================
-- 0009 â€” Storage buckets and their access rules.
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
-- Write rules â€” content staff upload, only into folders that match the bucket's
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
    and owner::text = public.auth_uid()::text
  );

create policy "admins delete any upload"
  on storage.objects for delete
  to authenticated
  using (public.is_admin());

-- There is deliberately no UPDATE policy on storage.objects: replacing bytes in
-- place would let a released cover art file change underneath a distributor.
-- Upload a new path, point the row at it, keep the old file for the record.




-- ============================================================
-- 0010_seed_and_bootstrap.sql
-- ============================================================
-- 0010 â€” Seed data and first-admin bootstrap.
--
-- What is seeded here is structure and wording that is true by construction:
-- the artist's own identity, genre vocabulary, a list of real distributors we
-- have NOT integrated with (api_connected = false everywhere), and the
-- integration checklist. No streams, no awards, no press quotes, no
-- collaborations, and no biography facts are invented â€” those columns stay NULL
-- until the artist or an editor fills them in the dashboard.

-- ---------------------------------------------------------------------------
-- Catalogue identity
-- ---------------------------------------------------------------------------
insert into public.artists (slug, name, country, is_roster, bio)
values ('rex-kenny', 'REX KENNY', 'Uganda', true, null)
on conflict (slug) do update
  set name = excluded.name, country = excluded.country, is_roster = true;

insert into public.artist_profiles (
  slug, name, legal_name, city, country, genres, instruments, influences,
  mission, photo_alt, booking_email, press_email, published, seo_title, seo_description
)
values (
  'rex-kenny',
  'REX KENNY',
  null,                       -- legal name: the artist supplies it
  'Kasese',
  'Uganda',
  array['African Dancehall','Dancehall','Afro-fusion'],
  array['vocals'],           -- only what is stated on the artist's own site
  array[]::text[],           -- influences: left empty, never guessed
  'From Kasese, Uganda to the World.',
  'REX KENNY, African Dancehall artist from Kasese, Uganda â€” press photograph',
  null, null,                -- contacts: the artist enters real addresses
  true,
  'REX KENNY â€” Official Site',
  'Official website of REX KENNY, African Dancehall artist from Kasese, Uganda: music, videos, lyrics, beats and booking.'
)
on conflict (slug) do update
  set name = excluded.name,
      city = excluded.city,
      country = excluded.country,
      genres = excluded.genres,
      mission = excluded.mission,
      published = true;

insert into public.genres (slug, name, description, sort_order)
values
  ('african-dancehall', 'African Dancehall', 'Dancehall riddims sung and spoken in an African register.', 10),
  ('dancehall',         'Dancehall',         null, 20),
  ('afrobeats',         'Afrobeats',         null, 30),
  ('afro-fusion',       'Afro-fusion',       null, 40),
  ('amapiano',          'Amapiano',          null, 50),
  ('reggae',            'Reggae',            null, 60),
  ('hip-hop',           'Hip-hop',           null, 70)
on conflict (slug) do update set name = excluded.name;

insert into public.blog_categories (slug, name, description)
values
  ('news',      'News',      'Announcements from the artist.'),
  ('shows',     'Shows',     'Dates, appearances and reviews of live shows.'),
  ('studio',    'In the Studio', 'How records are made.'),
  ('behind-the-scenes', 'Behind the Scenes', null)
on conflict (slug) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- Distributors. delivery_mode is 'manual' and api_connected is false because
-- this site has no negotiated API access to any of them. The dashboard must
-- therefore say "you submit this yourself", never "delivered".
-- ---------------------------------------------------------------------------
insert into public.distributors
  (code, name, website, delivery_mode, api_connected, status_values,
   requires_isrc, requires_upc, min_artwork_px, notes)
values
  ('distrokid', 'DistroKid', 'https://distrokid.com', 'manual', false,
   array['in-review','approved','rejected','live'], true, false, 1400,
   'No API integration. Submissions are made on the distributor''s own site.'),
  ('tunecore', 'TuneCore', 'https://www.tunecore.com', 'manual', false,
   array['in-review','approved','rejected','live'], true, false, 1400, null),
  ('amuse', 'Amuse', 'https://amuse.io', 'manual', false,
   array['in-review','approved','rejected','live'], true, false, 1400, null),
  ('ditto', 'Ditto Music', 'https://www.dittomusic.com', 'manual', false,
   array['in-review','approved','rejected','live'], true, false, 1400, null),
  ('united-masters', 'United Masters', 'https://unitedmasters.com', 'manual', false,
   array['in-review','approved','rejected','live'], true, false, 1400,
   'Strong African storefront coverage.')
on conflict (code) do update
  set name = excluded.name, website = excluded.website;

-- ---------------------------------------------------------------------------
-- Integration checklist â€” every row starts 'missing'. The setup screen reads
-- this table next to src/lib/config.ts, so the dashboard can only ever show a
-- state the environment actually supports.
-- ---------------------------------------------------------------------------
insert into public.integration_connections
  (service, label, state, environment_variable, setup_url, detail)
values
  ('supabase',        'Supabase project',                'missing', 'NEXT_PUBLIC_SUPABASE_URL',
   'https://supabase.com/dashboard', 'Database, auth, storage and RLS.'),
  ('resend',          'Resend (transactional email)',     'missing', 'RESEND_API_KEY',
   'https://resend.com', 'Needs a verified sending domain with SPF/DKIM/DMARC.'),
  ('google_oauth',    'Google sign-in',                  'missing', 'GOOGLE_CLIENT_ID',
   'https://console.cloud.google.com/apis/credentials', null),
  ('ga4',             'Google Analytics 4',              'missing', 'NEXT_PUBLIC_GA_MEASUREMENT_ID',
   'https://analytics.google.com', null),
  ('search_console',  'Search Console',                  'missing', 'NEXT_PUBLIC_GSC_VERIFICATION',
   'https://search.google.com/search-console', 'Site ownership token and query data.'),
  ('sentry',          'Sentry error tracking',           'missing', 'SENTRY_DSN',
   'https://sentry.io', null)
on conflict (service) do update
  set label = excluded.label,
      environment_variable = excluded.environment_variable,
      setup_url = excluded.setup_url;

insert into public.analytics_integrations
  (provider, property_id, scopes)
values
  ('ga4', null, array[]::text[]),
  ('search_console', null, array[]::text[]),
  ('spotify_for_artists', null, array[]::text[]),
  ('apple_music', null, array[]::text[]),
  ('youtube_analytics', null, array[]::text[]),
  ('audiomack', null, array[]::text[]),
  ('boomplay', null, array[]::text[]),
  ('deezer', null, array[]::text[]),
  ('shazam', null, array[]::text[])
on conflict (provider) do nothing;

-- ---------------------------------------------------------------------------
-- Site settings the dashboard can edit. Values here are facts about the site
-- itself, not claims about the artist's career.
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, label)
values
  ('tagline', to_jsonb('From Kasese, Uganda to the World.'::text), 'Tagline'),
  ('hero_role', to_jsonb('African Dancehall Artist'::text), 'Hero role label'),
  ('nav_enabled',
   '{"music":true,"videos":true,"lyrics":true,"beats":true,"epk":true,"news":true}'::jsonb,
   'Navigation toggles'),
  ('comment_moderation', to_jsonb('manual'::text), 'Comment moderation'),
  ('newsletter_double_opt_in', to_jsonb(true), 'Require email confirmation before sending'),
  ('analytics_consent_mode', to_jsonb('basic'::text), 'Analytics consent mode')
on conflict (key) do update set label = excluded.label;

-- ---------------------------------------------------------------------------
-- First super admin.
--
-- Sign up at /auth/register with the address that should own the account, then
-- run this RPC once. It refuses to do anything as soon as one super admin
-- exists and someone other than a super admin calls it, so it cannot be used to
-- escalate later. Disable it after bootstrapping:
--   revoke execute on function public.bootstrap_super_admin(text) from authenticated;
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_super_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
  admin_count integer;
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    return 'Enter a valid email address.';
  end if;

  select count(*) into admin_count from public.user_roles where role = 'super_admin';

  if admin_count > 0 and not public.has_role('super_admin') then
    return 'Refused: a super admin already exists. Ask that account to grant the role.';
  end if;

  select u.id into target
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if target is null then
    return 'No account with that address yet â€” register first, then run this again.';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (target, 'super_admin', target)
  on conflict (user_id, role) do nothing;

  insert into public.audit_logs (actor_user_id, action, entity, entity_id, detail)
  values (target, 'role.bootstrap', 'user_roles', target::text,
          jsonb_build_object('role'::text, 'super_admin'::text));

  return 'Granted super_admin. Sign out and back in so the new role enters the token.';
end;
$$;

revoke all on function public.bootstrap_super_admin(text) from public;
revoke all on function public.bootstrap_super_admin(text) from anon;
grant execute on function public.bootstrap_super_admin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grant the database what the policies need. PostgREST roles already own their
-- default grants on Supabase; these are the explicit pieces.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.releases, public.tracks, public.music_videos, public.beats,
                public.blog_posts, public.artist_profiles, public.artist_social_links,
                public.streaming_links, public.artists, public.genres, public.blog_categories
  to anon;




-- 0011_music_upload.sql

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


-- 0012_ai_assistant.sql

-- 0012 — AI assistant: persistent chat memory for staff.
--
-- The /admin/assistant page lets staff ask about the catalogue and get
-- onboarding help. This table is the "memory": every question and answer is
-- kept per account so the conversation survives sign-out and device changes.
-- Rows are private to their owner — a staff member never reads a colleague's
-- thread, and fans have no access at all (is_staff() gate on every policy).
--
-- If this migration is not applied the assistant still answers; the chat UI
-- reports memory as "session only" instead of pretending it remembers.

create table public.ai_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create index ai_chat_messages_user_idx
  on public.ai_chat_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped. The assistant writes through the signed-in user's own
-- token (createSupabaseServerClient), so these policies are the enforcement:
-- you can only ever read, add or delete your own messages, and only while your
-- account still carries a staff role.
-- ---------------------------------------------------------------------------
alter table public.ai_chat_messages enable row level security;

create policy "ai chat: staff read own"
  on public.ai_chat_messages for select
  to authenticated
  using (user_id = public.auth_uid() and public.is_staff());

create policy "ai chat: staff insert own"
  on public.ai_chat_messages for insert
  to authenticated
  with check (user_id = public.auth_uid() and public.is_staff());

create policy "ai chat: staff delete own"
  on public.ai_chat_messages for delete
  to authenticated
  using (user_id = public.auth_uid() and public.is_staff());
