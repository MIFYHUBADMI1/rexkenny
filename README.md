# REX KENNY MUSIC

Official artist platform and music-business HQ for REX KENNY — African Dancehall
artist, singer, songwriter, rapper and producer from Kasese, Uganda.
*"From Kasese, Uganda to the World."*

Live origin: **https://rexkenny.atai.ink**

The site is built SEO-first: every page emits typed structured data, the sitemap
is generated from the same queries the pages use, and nothing is published that
the database cannot back up. Unconfigured integrations report **"Not connected"**
instead of showing invented numbers.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Styling | Tailwind CSS v4 design tokens (black / gold / rich red / white) |
| Icons | lucide-react |
| Data & auth | Supabase — Postgres with Row Level Security, Auth, Storage |
| Validation | Zod, at every server-action boundary |
| Sanitisation | sanitize-html for any rich text before it renders |
| Motion | CSS keyframes and transitions only — no animation library in the bundle |

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in Supabase; everything else is optional
npm run dev                    # http://localhost:3000
```

The site runs with **no** environment variables set: it renders clearly-labelled
demo content, `/admin/setup` lists what is missing, and any write reports that
the database is not connected rather than pretending to succeed.

To put real content in it, apply the ten SQL migrations in `supabase/migrations`
in filename order and create the first administrator.
**[supabase/README.md](supabase/README.md)** covers the CLI path, the SQL-editor
path, `bootstrap_super_admin()`, revoking it afterwards, and exactly where
authorisation is enforced.

### Environment

| Variable | Purpose | If unset |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata, sitemap, robots, OG, JSON-LD | Defaults to `https://rexkenny.atai.ink` |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Public data reads, browser auth | Demo content, clearly labelled |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin writes | Admin writes refuse to run |
| `IP_SALT` | Salt for the contact-form throttle hash | A fixed default is used; change it to reset all windows |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` + `EMAIL_FROM` | Email (SMTP, e.g. Gmail App Password) | The subscribe form says the provider is not connected |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Analytics | No script is loaded, no traffic is reported |
| `NEXT_PUBLIC_GSC_SITE_VERIFICATION` | Search Console proof in `<head>` | No verification tag |
| `AI_API_KEY` | Optional admin assistant | The feature is not offered |

Set `NEXT_PUBLIC_SITE_URL` to the real origin in every deployed environment.
With it unset the canonical, sitemap and JSON-LD URLs still resolve to
`https://rexkenny.atai.ink` — a preview build must not publish
`http://localhost:3000` as the authoritative address of every page.

---

## Verification

```bash
npm run verify    # typecheck + lint + SQL + schema + links + assets + production build
```

Each gate measures something in the repository rather than asserting it:

| Script | What it proves |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over strict TypeScript |
| `npm run lint` | ESLint 9 flat config with `next/core-web-vitals` + `next/typescript` |
| `npm run lint:sql` | 354 statements parse; every FK, index, policy, trigger and insert target exists |
| `npm run check:schema` | Every column and every embed the TypeScript layer reads exists in the DDL (48 tables, 503 columns) |
| `npm run check:links` | Every literal internal link resolves to a real route (37 routes) |
| `npm run check:assets` | Referenced files exist, are inside byte/dimension budgets, and every uncropped `<img>` box matches the file's real ratio |
| `npm run check:seo <origin>` | **Live audit of rendered HTML** — see below |

`check:seo` needs a running server because it audits what a crawler actually
receives:

```bash
npm run build && npm run start &   # then
npm run check:seo http://127.0.0.1:3000
```

It walks every URL in `sitemap.xml` plus the admin routes and a deliberately
bogus path, and fails on: a missing `<title>`, `lang`, charset, viewport or
canonical; two H1s; a relative URL in JSON-LD; an unparsable date; a page that
is both in the sitemap and marked `noindex`; a missing `alt`; a placeholder
string ("Lorem ipsum", "TODO", "undefined", "NaN", "[object Object]") in
visible text; a missing `robots.txt` directive; a 404 that is not a 404; and
payloads over budget. If no server answers it says **NOT VERIFIED** and exits
non-zero — it never reports a pass it did not observe.

Last recorded run: 20 URLs, 0 failures, 0 warnings, 9 JSON-LD types
(`BreadcrumbList, CollectionPage, FAQPage, MusicGroup, MusicRecording,
Organization, Person, WebPage, WebSite`), ~179 KB of JS on first load.

---

## Public surface

`/` · `/music` · `/music/[slug]` · `/artist/[slug]` · `/videos` ·
`/videos/[slug]` · `/lyrics` · `/lyrics/[slug]` · `/news` · `/news/[slug]` ·
`/beats` · `/beats/[slug]` · `/listen` · `/about` · `/epk` · `/contact` ·
`/licensing` · `/search` · four legal documents · `/sitemap.xml` ·
`/robots.txt` · `/llms.txt`

- **Structured data** — `MusicGroup`, `Person`, `MusicRecording` with an
  `ItemList` of its own track nodes, `VideoObject`,
  `Article`,
  `BreadcrumbList`, `CollectionPage` + `ItemList`, `FAQPage`, `WebPage`,
  `WebSite` with `SearchAction`, `Organization`. A listing page builds its
  `ItemList` and its visible list from the *same* array, and the FAQ block
  renders the same text it serialises, so markup cannot claim what the page
  does not show.
- **Availability sentences are derived**, never assumed: a page only says
  "Listen on Spotify, Boomplay…" for platforms that have a row for that record.
- **`/lyrics`** lists only tracks whose `lyrics_cleared` flag is true, so a
  listed URL never 404s for a rights decision.
- **`/listen`** is the smart-link page: one URL per release, ranked
  destinations, no fabricated store presence.
- **Language alternate** is `x-default` + `en` only. No second language is
  claimed because no second language exists.
- `sitemap.xml` is `force-dynamic`: a release published after the last deploy
  is in it immediately.

## Motion

`src/components/motion` + the `Motion` block in `src/app/globals.css`. CSS
keyframes and transitions, no runtime library, deliberately bounded:

- Server HTML never contains a hidden element. `Reveal` adds the hidden class
  from script, and only for blocks still below the viewport, so readers without
  JavaScript, crawlers and slow connections see finished content with no flash.
- `prefers-reduced-motion: reduce` collapses every duration in one base rule,
  and the end state of every animation is the visible state.
- Hover effects (lift, artwork breathing, gold underline, button sheen) are
  pointer-only, so a touch device gets the same layout with no movement.
- The equaliser bars in the player appear only while audio is actually playing.
- `TaglineBand` scrolls the artist's own words; the loop copy is `aria-hidden`,
  so no screen reader hears the same sentence twice.

---

## Private dashboard

`/admin` is `noindex`, `Disallow`ed, and gated by `requireStaff` /
`requireEditor` / `requireAdmin` (`src/lib/auth/session.ts`). What the interface
shows is not what a caller may do: the browser always talks to Postgres with the
anon key, so **Row Level Security is the authorisation boundary**. Middleware and
helpers are the second layer, not the first.

Built and usable: **Overview**, **Releases** (create/edit, 11 statuses with only
the legal transitions offered, readiness scoring, tracks, artwork, streaming
links, SEO panel, export), **Distribution** (read-only evidence view),
**SEO** (per-page audit, index controls, structured-data walk), **Setup status**.

Not built yet, listed honestly in the sidebar: Media, Pages & posts, Fans,
Enquiries, Newsletter, Analytics, Trends, Settings. The tables and policies for
all of them already exist in the migrations; what is missing is the admin UI.

---

## What this project refuses to do

These are constraints, not gaps:

- No invented biography, awards, collaborators, press quotes, streaming counts
  or chart positions. Seeded artist columns are `NULL` until the artist fills
  them in, and pages that would need them say so.
- No claim that a release reached a store unless `api_verified` is true or a
  named human confirmed it with a timestamp (`claims_must_be_backed`).
- No analytics without a provider. No row without `provider` + `fetched_at`, and
  a manual row must record `manual_basis`.
- No lyrics without `lyrics_cleared`; no master recording in a public bucket
  (`master_stays_private`); public audio readable only under `previews/`.
- No password storage of any kind beyond Supabase Auth, and no service-role key
  outside a module that begins with `import "server-only"`.
- No email sending without SMTP credentials (`SMTP_*` + `EMAIL_FROM`), and no
  subscriber storage without double opt-in: the confirmation link is single-use
  and only its SHA-256 hash is stored. Nothing here sends unsolicited mail.
- No scraping of restricted services and no automatic publishing to social
  platforms without authorised API permissions. `SOCIALS` entries stay empty
  until a real profile exists — empty links are never rendered and never enter
  `sameAs`.
- Demo content appears only when no database is connected, is labelled on
  screen, and is excluded from the sitemap once real rows exist.

## Known limitations

- **No local Postgres in this repository.** The SQL is parsed and cross-checked
  against the TypeScript data layer, never executed. Read the policies before
  go-live; a policy can be well-formed and still wrong.
- Email (Resend) is not wired: the key is read, no message is sent.
- GA4 loads only when an ID is set; there is no first-party analytics collector.
- The eight unbuilt admin modules above.
- `public/images/issues/` is the operator's working asset drop (92 MB of
  originals, drafts and notes from other projects). Nothing references it, it is
  git-ignored, and `robots.txt` disallows it — but it is still on disk and, if it
  reaches a host, still downloadable. Move it out of `public/` before deploying.
- No CI workflow and no browser-level end-to-end suite; the gates above are
  static analysis plus a live HTML audit.

## Deploying

1. Push to your host (Vercel is the assumed target) and add the domain
   `rexkenny.atai.ink`.
2. Set `NEXT_PUBLIC_SITE_URL=https://rexkenny.atai.ink` plus the Supabase keys,
   `SUPABASE_SERVICE_ROLE_KEY` and `IP_SALT`.
3. Apply the migrations and bootstrap the first admin
   ([instructions](supabase/README.md#first-administrator)), then revoke
   `bootstrap_super_admin`.
4. `npm run verify`, then audit the deployed origin:
   `npm run check:seo https://rexkenny.atai.ink`.
5. Submit `sitemap.xml` in Search Console and confirm the site reports the
   right canonical host.
