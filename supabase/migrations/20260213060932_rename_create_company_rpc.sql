-- Rename create_company_and_set_owner → create_company_with_owner
-- for clarity and to match the onboarding API contract.

create or replace function public.create_company_with_owner(p_name text)
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
revoke execute on function public.create_company_with_owner(text) from public;
revoke execute on function public.create_company_with_owner(text) from anon;
grant execute on function public.create_company_with_owner(text) to authenticated;

-- Drop the old name
drop function if exists public.create_company_and_set_owner(text);;
