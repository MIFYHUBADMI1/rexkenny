-- 0002 — Identity, roles, artist profile, site settings.

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
-- user_roles — the source of truth for RBAC.
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
-- artist_profiles — supports multiple artists later (label expansion), but
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
-- site_settings — single-row key/value store for CMS-editable site copy.
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
