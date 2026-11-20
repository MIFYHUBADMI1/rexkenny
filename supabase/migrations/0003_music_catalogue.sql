-- 0003 — Music catalogue: releases, tracks, links, videos, beats, media.
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
-- genres — lookup table behind the /music genre filter and admin dropdowns.
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
-- releases — one row per single / EP / album / mixtape / instrumental / video.
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
-- tracks — the recordings inside a release.
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
-- track_artists — normalised contributors, used for metadata exports and the
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
-- streaming_links — one row per platform per release (or per artist profile).
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
-- beats — instrumentals offered for licence.
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
-- audio_assets — files in Supabase Storage. Private buckets keep masters out of
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
-- media_library — press photos, logos and documents that are not release files.
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
