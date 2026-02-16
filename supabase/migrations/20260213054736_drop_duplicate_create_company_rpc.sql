-- Drop the duplicate create_company() RPC.
-- Replaced by create_company_and_set_owner() which has the same logic.
drop function if exists public.create_company(text);;
