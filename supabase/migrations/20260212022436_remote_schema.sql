create extension if not exists "pg_cron" with schema "pg_catalog";
create extension if not exists "pg_net" with schema "extensions";
create table "public"."sim_control" (
    "id" integer not null default 1,
    "enabled" boolean not null default false
      );
create table "public"."sim_tick" (
    "id" integer not null default 1,
    "t" integer not null default 0
      );
CREATE UNIQUE INDEX sim_control_pkey ON public.sim_control USING btree (id);
CREATE UNIQUE INDEX sim_tick_pkey ON public.sim_tick USING btree (id);
alter table "public"."sim_control" add constraint "sim_control_pkey" PRIMARY KEY using index "sim_control_pkey";
alter table "public"."sim_tick" add constraint "sim_tick_pkey" PRIMARY KEY using index "sim_tick_pkey";
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.sim_call_ingest(p_machine_id uuid, p_vault_key_name text, p_value double precision)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_url text;
  v_pub text;
  v_mkey text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'project_url';

  select decrypted_secret into v_pub
  from vault.decrypted_secrets
  where name = 'publishable_key';

  select decrypted_secret into v_mkey
  from vault.decrypted_secrets
  where name = p_vault_key_name;

  perform net.http_post(
    url := v_url || '/functions/v1/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_pub,
      'x-machine-key', v_mkey
    ),
    body := jsonb_build_object(
      'machine_id', p_machine_id::text,
      'device_ts', now(),
      'value', p_value
    ),
    timeout_milliseconds := 30000
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.sim_next_tick()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare v int;
begin
  update public.sim_tick
  set t = t + 1
  where id = 1
  returning t into v;

  return v;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sim_run_step(p_rate_label text DEFAULT '1s'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tick int;
  v_enabled boolean;
begin
  select coalesce(enabled, false)
    into v_enabled
  from public.sim_control
  where id = 1;

  if not v_enabled then
    return;
  end if;

  v_tick := public.sim_next_tick();

  -- Machine 01
  perform public.sim_call_ingest(
    'cf6b2a74-cfa7-47a4-b208-7c471eec9dde'::uuid,
    'sim_machine_key_01',
    public.sim_value(3200, v_tick)
  );

  -- Machine 02
  perform public.sim_call_ingest(
    '95be317e-b06b-4bbb-ac4d-135e07ab9a1a'::uuid,
    'sim_machine_key_02',
    public.sim_value(12, v_tick)
  );

  -- Machine 03
  perform public.sim_call_ingest(
    '212e0bfc-627d-4bee-a836-709b8123ea37'::uuid,
    'sim_machine_key_03',
    public.sim_value(8, v_tick)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.sim_value(p_base double precision, p_tick integer)
 RETURNS double precision
 LANGUAGE sql
AS $function$
  select
    case
      -- downtime: stopped for 10s out of every 60s
      when (p_tick % 60) < 10 then 0

      -- faulty period: spike for 20s out of every 300s
      when (p_tick % 300) between 200 and 220
        then p_base * 1.7 + (random() * p_base * 0.2)

      -- normal running: base + small noise
      else p_base + (random() - 0.5) * p_base * 0.05
    end;
$function$;
grant delete on table "public"."sim_control" to "anon";
grant insert on table "public"."sim_control" to "anon";
grant references on table "public"."sim_control" to "anon";
grant select on table "public"."sim_control" to "anon";
grant trigger on table "public"."sim_control" to "anon";
grant truncate on table "public"."sim_control" to "anon";
grant update on table "public"."sim_control" to "anon";
grant delete on table "public"."sim_control" to "authenticated";
grant insert on table "public"."sim_control" to "authenticated";
grant references on table "public"."sim_control" to "authenticated";
grant select on table "public"."sim_control" to "authenticated";
grant trigger on table "public"."sim_control" to "authenticated";
grant truncate on table "public"."sim_control" to "authenticated";
grant update on table "public"."sim_control" to "authenticated";
grant delete on table "public"."sim_control" to "service_role";
grant insert on table "public"."sim_control" to "service_role";
grant references on table "public"."sim_control" to "service_role";
grant select on table "public"."sim_control" to "service_role";
grant trigger on table "public"."sim_control" to "service_role";
grant truncate on table "public"."sim_control" to "service_role";
grant update on table "public"."sim_control" to "service_role";
grant delete on table "public"."sim_tick" to "anon";
grant insert on table "public"."sim_tick" to "anon";
grant references on table "public"."sim_tick" to "anon";
grant select on table "public"."sim_tick" to "anon";
grant trigger on table "public"."sim_tick" to "anon";
grant truncate on table "public"."sim_tick" to "anon";
grant update on table "public"."sim_tick" to "anon";
grant delete on table "public"."sim_tick" to "authenticated";
grant insert on table "public"."sim_tick" to "authenticated";
grant references on table "public"."sim_tick" to "authenticated";
grant select on table "public"."sim_tick" to "authenticated";
grant trigger on table "public"."sim_tick" to "authenticated";
grant truncate on table "public"."sim_tick" to "authenticated";
grant update on table "public"."sim_tick" to "authenticated";
grant delete on table "public"."sim_tick" to "service_role";
grant insert on table "public"."sim_tick" to "service_role";
grant references on table "public"."sim_tick" to "service_role";
grant select on table "public"."sim_tick" to "service_role";
grant trigger on table "public"."sim_tick" to "service_role";
grant truncate on table "public"."sim_tick" to "service_role";
grant update on table "public"."sim_tick" to "service_role";
create policy "pilot_select_readings"
  on "public"."readings"
  as permissive
  for select
  to anon
using (true);
create policy "readings_select_anon"
  on "public"."readings"
  as permissive
  for select
  to anon
using (true);
