-- Enums
create type public.translation_code as enum ('kjv', 'asv', 'web');
create type public.reminder_channel as enum ('email', 'sms', 'push');
create type public.prayer_input_method as enum ('text', 'voice');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  preferred_translation public.translation_code not null default 'kjv',
  reminder_enabled boolean not null default false,
  reminder_time time,
  reminder_days text[],
  reminder_channel public.reminder_channel not null default 'push',
  push_token text,
  phone_number text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prayers
create table public.prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null,
  input_method public.prayer_input_method not null default 'text',
  detected_needs text[],
  is_answered boolean not null default false,
  answered_at timestamptz,
  answered_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prayer_verses
create table public.prayer_verses (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayers(id) on delete cascade,
  reference text not null,
  verse_text text not null,
  translation public.translation_code not null,
  explanation text,
  sort_order int not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Friend'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.prayers enable row level security;
alter table public.prayer_verses enable row level security;

-- profiles: readable by all authenticated users; writable only by own user (prPrompt.md RLS section)
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- prayers: users can only read/write their own
create policy "prayers_select_own" on public.prayers
  for select to authenticated using (auth.uid() = user_id);
create policy "prayers_insert_own" on public.prayers
  for insert to authenticated with check (auth.uid() = user_id);
create policy "prayers_update_own" on public.prayers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- prayer_verses: users can only read/write verses for their own prayers
create policy "prayer_verses_select_own" on public.prayer_verses
  for select to authenticated using (
    exists (select 1 from public.prayers p where p.id = prayer_verses.prayer_id and p.user_id = auth.uid())
  );
create policy "prayer_verses_insert_own" on public.prayer_verses
  for insert to authenticated with check (
    exists (select 1 from public.prayers p where p.id = prayer_verses.prayer_id and p.user_id = auth.uid())
  );
