-- Restrict execute on create_plant_for_company to authenticated only.
revoke execute on function public.create_plant_for_company(uuid, text) from public;
revoke execute on function public.create_plant_for_company(uuid, text) from anon;
grant execute on function public.create_plant_for_company(uuid, text) to authenticated;
