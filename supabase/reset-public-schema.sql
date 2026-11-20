-- ============================================================
-- RESET — run this FIRST, then run apply-all-in-one.sql
--
-- The first attempt at apply-all-in-one.sql stopped partway
-- through (invalid CREATE POLICY syntax, now fixed), so the
-- public schema is in a half-built state. This drops it so the
-- fixed script can run cleanly from scratch.
--
-- The database was empty before this project, so nothing is
-- lost. Supabase Auth (auth schema) and Storage are untouched.
-- ============================================================

drop schema if exists public cascade;
create schema public;

-- Restore the grants a fresh Supabase public schema has, so
-- PostgREST (anon / authenticated / service_role) and the SQL
-- editor (postgres) keep working.
grant usage on schema public to anon, authenticated, service_role, authenticator;
grant all on schema public to postgres, service_role;

-- Tables/functions/sequences created afterwards must be usable
-- by the API roles. Row access is still governed by RLS.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to postgres;
alter default privileges for role postgres in schema public
  grant all on functions to postgres;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres;
