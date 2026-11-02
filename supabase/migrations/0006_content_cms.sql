-- 0006 — Content CMS: categories, posts, pages.
--
-- blog_posts is read by src/lib/content.ts getPosts() with
-- select("*").eq("status","published").order("published_at desc"), so every
-- column mapPost() touches has to exist here under the same name.

create table public.blog_categories (
  slug        text primary key check (public.is_valid_slug(slug)),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.blog_posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (public.is_valid_slug(slug)),
  title          text not null check (char_length(title) between 1 and 200),
  excerpt        text not null default '' check (char_length(excerpt) <= 400),
  -- Sanitised in the admin layer (src/lib/sanitize.ts) before it is written.
  body_html      text not null default '',
  category       text not null default 'News',
  author_name    text not null default 'REX KENNY',
  cover_image    text check (cover_image is null or cover_image ~ '^(/|https?://)'),
  cover_alt      text,
  published_at   timestamptz,
  -- Cached at save time from the body length; shown as an estimate, not a fact.
  reading_minutes integer not null default 1 check (reading_minutes between 1 and 600),
  status         text not null default 'draft' check (status in ('draft','scheduled','published')),
  seo_title      text,
  seo_description text,
  canonical_url  text,
  og_image       text,
  noindex        boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Nothing can be 'published' without a date, and nothing can claim a past
  -- publish date while still sitting in draft.
  constraint published_needs_date check (status <> 'published' or published_at is not null),
  constraint scheduled_is_future check (status <> 'scheduled' or published_at > now())
);

create index blog_posts_status_published_idx on public.blog_posts (status, published_at desc);
create index blog_posts_category_idx on public.blog_posts (category);
create index blog_posts_search_idx on public.blog_posts
  using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,'')));

create trigger set_updated_at_blog_posts
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- pages — the long-form, non-post pages (tour dates, charity work, store copy).
create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (public.is_valid_slug(slug)),
  title       text not null check (char_length(title) between 1 and 200),
  -- Route this content is served on. Restricted to a safe, relative path so a
  -- CMS row can never point a nav link at an external host.
  route       text not null unique check (route ~ '^/[a-z0-9/-]*$'),
  body_html   text not null default '',
  description text,
  published   boolean not null default false,
  seo_title   text,
  seo_description text,
  canonical_url text,
  og_image    text,
  noindex     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at_pages
  before update on public.pages
  for each row execute function public.set_updated_at();

-- Publishing a post should stamp a date exactly once, and moving it back to
-- draft should not silently rewrite history.
create or replace function public.stamp_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger before_blog_posts_save
  before insert or update on public.blog_posts
  for each row execute function public.stamp_published_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.pages enable row level security;

create policy "categories: public read"
  on public.blog_categories for select
  to anon, authenticated
  using (true);

create policy "categories: editors write"
  on public.blog_categories for all
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "posts: public read published"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published');

create policy "posts: staff read all"
  on public.blog_posts for select
  to authenticated
  using (public.is_staff());

create policy "posts: editors write"
  on public.blog_posts for insert, update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "posts: admins delete"
  on public.blog_posts for delete
  to authenticated
  using (public.is_admin());

create policy "pages: public read published"
  on public.pages for select
  to anon, authenticated
  using (published = true);

create policy "pages: staff read all"
  on public.pages for select
  to authenticated
  using (public.is_staff());

create policy "pages: editors write"
  on public.pages for insert, update
  to authenticated
  using (public.can_edit_content())
  with check (public.can_edit_content());

create policy "pages: admins delete"
  on public.pages for delete
  to authenticated
  using (public.is_admin());
