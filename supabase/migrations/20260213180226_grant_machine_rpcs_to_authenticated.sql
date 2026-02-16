revoke execute on function public.create_machine_group(uuid, text) from public;
revoke execute on function public.create_machine_group(uuid, text) from anon;
grant execute on function public.create_machine_group(uuid, text) to authenticated;

revoke execute on function public.create_machine_with_group(uuid, text, text, text, uuid) from public;
revoke execute on function public.create_machine_with_group(uuid, text, text, text, uuid) from anon;
grant execute on function public.create_machine_with_group(uuid, text, text, text, uuid) to authenticated;
