create table if not exists public.app_user_state (
  user_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_user_state enable row level security;

drop policy if exists "Users can read own state" on public.app_user_state;
create policy "Users can read own state"
on public.app_user_state
for select
using (true);

drop policy if exists "Users can write own state" on public.app_user_state;
create policy "Users can write own state"
on public.app_user_state
for insert
with check (true);

drop policy if exists "Users can update own state" on public.app_user_state;
create policy "Users can update own state"
on public.app_user_state
for update
using (true)
with check (true);

