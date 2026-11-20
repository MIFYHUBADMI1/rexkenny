-- 0007 — Analytics and trend intelligence.
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
