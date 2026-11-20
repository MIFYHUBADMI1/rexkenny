-- 0004 — Distribution.
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
