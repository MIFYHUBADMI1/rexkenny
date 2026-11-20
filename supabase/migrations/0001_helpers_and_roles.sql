-- 0001 — Extensions, shared helpers, audit trigger.
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
-- environments where triggers may not touch auth.users — see README.
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
     set app_metadata = coalesce(app_metadata, '{}'::jsonb)
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
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (actor_user_id, action, entity, entity_id, detail)
  values (actor, action, entity, entity_id, coalesce(detail, '{}'::jsonb));
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
