-- Add DELETE RLS policies for prayers and prayer_verses
create policy "prayers_delete_own" on public.prayers
  for delete to authenticated using (auth.uid() = user_id);

create policy "prayer_verses_delete_own" on public.prayer_verses
  for delete to authenticated using (
    exists (select 1 from public.prayers p where p.id = prayer_verses.prayer_id and p.user_id = auth.uid())
  );
