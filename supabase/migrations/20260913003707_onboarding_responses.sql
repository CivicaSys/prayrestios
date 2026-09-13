-- onboarding_responses: one row per completed pre-auth quiz, analytics/attribution only.
create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quiz_answers jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.onboarding_responses enable row level security;

create policy "onboarding_responses_select_own" on public.onboarding_responses
  for select to authenticated using (auth.uid() = user_id);
create policy "onboarding_responses_insert_own" on public.onboarding_responses
  for insert to authenticated with check (auth.uid() = user_id);

-- Extend the existing profile-bootstrap trigger function to also record quiz
-- answers when the client sent them at signup. The trigger itself
-- (on_auth_user_created) already points at this function name, so replacing
-- the function body is enough -- no need to touch the trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Friend'));

  if new.raw_user_meta_data ? 'quiz_answers' then
    insert into public.onboarding_responses (user_id, quiz_answers)
    values (new.id, new.raw_user_meta_data->'quiz_answers');
  end if;

  return new;
end;
$$;
