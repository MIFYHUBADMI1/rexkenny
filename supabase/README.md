# Supabase migrations

Ten ordered files. `0001` defines the helper functions every later file uses, so
they must be applied in filename order.

| File | Creates |
| --- | --- |
| `0001_helpers_and_roles.sql` | `set_updated_at`, `is_valid_slug`, `auth_uid`, `has_role`, `is_staff`, `can_edit_content`, `is_admin`, `sync_jwt_roles`, `record_audit` |
| `0002_identity_and_access.sql` | `profiles`, `user_roles`, `artist_profiles`, `artists`, `artist_social_links`, `site_settings` |
| `0003_music_catalogue.sql` | `genres`, `releases`, `tracks`, `track_artists`, `streaming_links`, `music_videos`, `beats`, `audio_assets`, `artwork_assets`, `media_library` |
| `0004_distribution.sql` | `distributors`, `release_territories`, `distribution_submissions`, `distribution_status_history`, `release_metadata_exports` |
| `0005_fans_and_enquiries.sql` | `fan_profiles`, `fan_favourites`, `fan_activity`, `newsletter_subscribers`, `email_preferences`, `contact_submissions`, `comments`, `shares`, the `booking_enquiries` view and the throttle RPC |
| `0006_content_cms.sql` | `blog_categories`, `blog_posts`, `pages` |
| `0007_analytics_and_trends.sql` | `analytics_integrations`, `analytics_events`, `page_views`, `traffic_sources`, `release_analytics`, `search_queries`, `trend_snapshots`, `analytics_saved_reports` |
| `0008_system_and_email.sql` | `audit_logs`, `notifications`, `email_campaigns`, `email_delivery_logs`, `integration_connections`, `queue_email_campaign()` |
| `0009_storage.sql` | seven buckets and their read/upload/delete rules |
| `0010_seed_and_bootstrap.sql` | the artist row, genres, categories, distributor list, integration checklist, `bootstrap_super_admin()` |

## Applying them

**Supabase CLI** (recommended, keeps `_supabase_migrations` in sync):

```bash
supabase link --project-ref <ref>
supabase db push
```

**SQL editor**: open each file in order, paste into the dashboard SQL editor,
run one at a time. They are not idempotent as a set — run each exactly once —
but every seed statement uses `on conflict ... do update/do nothing`, so
re-running `0010` alone is safe.

Nothing in this repository executes the SQL: there is no local Postgres here.
`npm run lint:sql` parses the files and verifies that foreign keys, indexes,
policies, triggers and inserts point at tables and columns that actually exist,
and `npm run check:schema` verifies that every column the TypeScript data layer
reads is present in the DDL. Both are wired into `npm run verify`. That catches
name and shape mistakes; it cannot catch a semantic error in a policy, so read
the policies before you go live.

## First administrator

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, deploy,
   and confirm `/admin/setup` reports Supabase as connected.
2. Register at `/auth/register`. The account gets the `fan` role automatically —
   the signup form cannot grant anything else, and `user_roles` has no UPDATE
   policy, so an account cannot rewrite its own role.
3. Run once, in the SQL editor or as an RPC call:

   ```sql
   select public.bootstrap_super_admin('you@example.com');
   ```

4. Sign out and back in. Roles travel inside the JWT (`app_metadata.roles`), so
   an old token still carries the old roles.
5. Close the door:

   ```sql
   revoke execute on function public.bootstrap_super_admin(text) from authenticated;
   ```

   Until you revoke it, the function can promote one account only while no
   `super_admin` exists; afterwards it refuses everyone who is not already a
   super admin.

## Where authorisation is actually enforced

`src/proxy.ts` and the `requireStaff` / `requireEditor` / `requireAdmin`
helpers decide what the interface *shows*. The database decides what a caller
*can read or write*. Both sides are needed and neither substitutes for the other:

- `0001` mirrors `user_roles` into `auth.users.app_metadata.roles` through
  `sync_jwt_roles()`, so policies can test a role without reading `user_roles`
  inside its own policy (which would recurse).
- If that trigger is blocked in your environment, roles stop appearing in new
  tokens. The helpers in `src/lib/auth/session.ts` fall back to a `user_roles`
  query, so the dashboard keeps working, but every policy that calls `has_role`
  starts denying. Test after a fresh signup: promote yourself, sign out, sign in.
- Anonymous visitors get exactly these reads: released `releases` with their
  tracks and links, published `artist_profiles` with social links, published
  `music_videos`, published `beats`, published `blog_posts` and `pages`,
  approved `comments`, public `media_library` rows, and the three public storage
  buckets. Everything else has no policy, which in Postgres means denied.
- Writes that must not be forgeable from a browser token have **no** client
  policy at all: `audit_logs`, `distribution_status_history`,
  `email_delivery_logs`, and `newsletter_subscribers` reads. They are written by
  `security definer` functions or by the service-role key, which lives only in
  the server environment (`src/lib/supabase/admin.ts` starts with
  `import "server-only"`).

## Things this schema refuses to record

These are deliberate, not unfinished:

- No column holds an invented metric. `release_analytics` requires a `provider`
  and a `fetched_at`, and a `manual` row requires `manual_basis` explaining it.
- No submission can read `uploaded`, `in-review`, `approved`, `scheduled`,
  `live` or `delivered` unless `api_verified` is true or a named human confirmed
  it with a timestamp (`claims_must_be_backed` in `0004`).
- A track cannot store lyrics unless `lyrics_cleared` is true.
- A master recording cannot live in a public bucket (`master_stays_private`) and
  the public bucket cannot be read except under the `previews/` prefix.
- An integration cannot report `connected` without a test that passed at a
  recorded time (`connected_needs_passed_test`).
- Seeds carry no biography, awards, collaborators, press quotes or numbers. Those
  columns are NULL until the artist fills them in.
