-- 0005 — Fans, newsletter and inbound enquiries.
--
-- Privacy posture: raw IPs are never stored (only a salted digest produced in
-- the server action), consent is recorded with a timestamp, and subscription is
-- double opt-in — a row starting as 'pending' is not a marketing contact.

-- ---------------------------------------------------------------------------
-- fan_profiles — the extra, fan-facing half of a profile.
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
-- contact_submissions — booking / collab / press / licensing inbound.
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
-- comments — off unless a fan is signed in, and held for moderation.
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

-- shares — a count of real share clicks, so the analytics page can show
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
