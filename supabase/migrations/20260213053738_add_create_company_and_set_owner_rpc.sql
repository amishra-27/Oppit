-- RPC: create_company_and_set_owner
-- Creates a company and makes the caller the owner atomically.
-- SECURITY DEFINER so it bypasses the companies INSERT RLS policy
-- (which blocks direct inserts to force use of this RPC).
-- auth.uid() is used internally — caller cannot set owner for someone else.

create or replace function public.create_company_and_set_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if trim(p_name) = '' then
    raise exception 'Company name cannot be empty';
  end if;

  insert into public.companies (name)
  values (trim(p_name))
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  return v_company_id;
end;
$$;

-- Grant execute to authenticated only
revoke execute on function public.create_company_and_set_owner(text) from public;
revoke execute on function public.create_company_and_set_owner(text) from anon;
grant execute on function public.create_company_and_set_owner(text) to authenticated;;
