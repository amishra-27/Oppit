create extension if not exists pgcrypto;

do $$
declare
  v_plant_id uuid := '11111111-1111-1111-1111-111111111111';

  v_machine_id uuid;
  v_machine_name text;
  v_primary_metric text;
  v_key_plain text;
  v_key_hash  text;
begin
  insert into public.plants (id, name)
  values (v_plant_id, 'Plant A')
  on conflict (id) do update set name = excluded.name;

  for v_machine_name, v_machine_id, v_primary_metric in
    select *
    from (values
      ('Machine 01', 'cf6b2a74-cfa7-47a4-b208-7c471eec9dde'::uuid, 'rpm'),
      ('Machine 02', '95be317e-b06b-4bbb-ac4d-135e07ab9a1a'::uuid, 'rpm'),
      ('Machine 03', '212e0bfc-627d-4bee-a836-709b8123ea37'::uuid, 'rpm')
    ) as t(name, id, primary_metric)
  loop
    insert into public.machines (id, plant_id, name, line, primary_metric)
    values (v_machine_id, v_plant_id, v_machine_name, 'Line 1', v_primary_metric)
    on conflict (id) do update set
      plant_id = excluded.plant_id,
      name = excluded.name,
      line = excluded.line,
      primary_metric = excluded.primary_metric;

    v_key_plain := case v_machine_name
      when 'Machine 01' then 'e771af0507dae39eae3c4671f49ef5886b7db7bdc1842fe1'
      when 'Machine 02' then 'e88e3be43be5da6e36945dee6fae1ab8bb068936be3f9fbb'
      when 'Machine 03' then 'd869214274747479203f526d61f85acf8dd6acc8a56cd958'
    end;

    v_key_hash := encode(digest(v_key_plain, 'sha256'), 'hex');

    delete from public.machine_api_keys where machine_id = v_machine_id;

    insert into public.machine_api_keys (machine_id, key_hash, is_active)
    values (v_machine_id, v_key_hash, true);

    raise notice 'API KEY : machine_name=% machine_id=% key=%',
      v_machine_name, v_machine_id, v_key_plain;
  end loop;
end $$;
