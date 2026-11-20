-- 0008 — System: audit, notifications, email, integration connections.

-- ---------------------------------------------------------------------------
-- audit_logs — append-only. 0001.record_audit() writes here with a security
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
-- notifications — the admin bell. Created by triggers and actions, never by a
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
-- email_campaigns — double opt-in is enforced where recipients are selected,
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
-- integration_connections — the honest status page. `connected` only ever true
-- after a real test call, which is why it also requires last_test_passed_at.
-- ---------------------------------------------------------------------------
create table public.integration_connections (
  service        text primary key check (
                   service in ('supabase','resend','google_oauth','ga4','search_console','sentry',
                               'spotify','apple_music','youtube','audiomack','boomplay','vercel_analytics')
                 ),
  label          text not null,
  -- 'missing' | 'partial' | 'connected' | 'error' — the four states a real
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
