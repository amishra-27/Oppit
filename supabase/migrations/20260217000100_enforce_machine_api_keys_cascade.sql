-- Ensure machine API keys are always deleted when their machine is deleted.

-- Clean up any historical orphan rows first so FK creation/validation cannot fail.
delete from public.machine_api_keys mak
where not exists (
  select 1
  from public.machines m
  where m.id = mak.machine_id
);

-- Recreate FK with explicit ON DELETE CASCADE to enforce referential cleanup.
alter table public.machine_api_keys
  drop constraint if exists machine_api_keys_machine_id_fkey;

alter table public.machine_api_keys
  add constraint machine_api_keys_machine_id_fkey
  foreign key (machine_id)
  references public.machines(id)
  on delete cascade;
