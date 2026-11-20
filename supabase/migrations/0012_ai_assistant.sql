-- 0012 — AI assistant: persistent chat memory for staff.
--
-- The /admin/assistant page lets staff ask about the catalogue and get
-- onboarding help. This table is the "memory": every question and answer is
-- kept per account so the conversation survives sign-out and device changes.
-- Rows are private to their owner — a staff member never reads a colleague's
-- thread, and fans have no access at all (is_staff() gate on every policy).
--
-- If this migration is not applied the assistant still answers; the chat UI
-- reports memory as "session only" instead of pretending it remembers.

create table public.ai_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create index ai_chat_messages_user_idx
  on public.ai_chat_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped. The assistant writes through the signed-in user's own
-- token (createSupabaseServerClient), so these policies are the enforcement:
-- you can only ever read, add or delete your own messages, and only while your
-- account still carries a staff role.
-- ---------------------------------------------------------------------------
alter table public.ai_chat_messages enable row level security;

create policy "ai chat: staff read own"
  on public.ai_chat_messages for select
  to authenticated
  using (user_id = public.auth_uid() and public.is_staff());

create policy "ai chat: staff insert own"
  on public.ai_chat_messages for insert
  to authenticated
  with check (user_id = public.auth_uid() and public.is_staff());

create policy "ai chat: staff delete own"
  on public.ai_chat_messages for delete
  to authenticated
  using (user_id = public.auth_uid() and public.is_staff());
