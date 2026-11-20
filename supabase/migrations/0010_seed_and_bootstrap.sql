-- 0010 — Seed data and first-admin bootstrap.
--
-- What is seeded here is structure and wording that is true by construction:
-- the artist's own identity, genre vocabulary, a list of real distributors we
-- have NOT integrated with (api_connected = false everywhere), and the
-- integration checklist. No streams, no awards, no press quotes, no
-- collaborations, and no biography facts are invented — those columns stay NULL
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
  'REX KENNY, African Dancehall artist from Kasese, Uganda — press photograph',
  null, null,                -- contacts: the artist enters real addresses
  true,
  'REX KENNY — Official Site',
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
-- Integration checklist — every row starts 'missing'. The setup screen reads
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
  ('tagline', to_jsonb('From Kasese, Uganda to the World.'), 'Tagline'),
  ('hero_role', to_jsonb('African Dancehall Artist'), 'Hero role label'),
  ('nav_enabled',
   '{"music":true,"videos":true,"lyrics":true,"beats":true,"epk":true,"news":true}'::jsonb,
   'Navigation toggles'),
  ('comment_moderation', to_jsonb('manual'), 'Comment moderation'),
  ('newsletter_double_opt_in', to_jsonb(true), 'Require email confirmation before sending'),
  ('analytics_consent_mode', to_jsonb('basic'), 'Analytics consent mode')
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
    return 'No account with that address yet — register first, then run this again.';
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
