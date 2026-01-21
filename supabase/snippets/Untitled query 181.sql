create policy "readings_select_anon"
on public.readings
for select
to anon
using (true);
