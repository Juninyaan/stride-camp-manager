-- Apply after 202610190005_bulk_and_rollover.sql.
alter table public.participants add column if not exists phone text;

create or replace function public.import_camp_participants(p_camp_id uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare camp public.camps%rowtype; item jsonb; athlete uuid; existing public.camp_registrations%rowtype;
  occupied integer; active boolean; paid boolean; new_status text; row_no integer; seen uuid[] := '{}';
begin
  select * into camp from public.camps where id = p_camp_id and created_by = auth.uid() for update;
  if not found then raise exception 'Camp not found or access denied'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import must contain between 1 and 1000 rows';
  end if;
  select count(*) into occupied from public.camp_registrations where camp_id = p_camp_id and status = 'registered';
  for item, row_no in
    select value, (ordinality + 1)::integer from jsonb_array_elements(p_rows) with ordinality
    order by (value->>'active' = 'inactive') desc, ordinality
  loop
    if coalesce(trim(item->>'first_name'), '') = '' or coalesce(trim(item->>'last_name'), '') = '' then
      raise exception 'Row %: first and last name are required', row_no;
    end if;
    if coalesce(item->>'active', '') not in ('active', 'inactive') or coalesce(item->>'paid', '') not in ('paid', 'unpaid') then
      raise exception 'Row %: invalid active or paid value', row_no;
    end if;
    active := item->>'active' = 'active';
    paid := item->>'paid' = 'paid';
    if coalesce(item->>'id', '') = '' then
      insert into public.participants(first_name, last_name, email, phone, guardian_name, guardian_email)
        values (trim(item->>'first_name'), trim(item->>'last_name'), nullif(trim(item->>'email'), ''),
          nullif(trim(item->>'phone'), ''), nullif(trim(item->>'guardian_name'), ''), nullif(trim(item->>'guardian_email'), ''))
        returning id into athlete;
    else
      athlete := (item->>'id')::uuid;
      if athlete = any(seen) then raise exception 'Row %: duplicate athlete ID', row_no; end if;
      seen := array_append(seen, athlete);
      update public.participants set first_name = trim(item->>'first_name'), last_name = trim(item->>'last_name'),
        email = nullif(trim(item->>'email'), ''), phone = case when item ? 'phone' then nullif(trim(item->>'phone'), '') else phone end,
        guardian_name = nullif(trim(item->>'guardian_name'), ''), guardian_email = nullif(trim(item->>'guardian_email'), '')
        where id = athlete and created_by = auth.uid();
      if not found then raise exception 'Row %: athlete ID not found in your account', row_no; end if;
    end if;
    select * into existing from public.camp_registrations where camp_id = p_camp_id and participant_id = athlete;
    if found and existing.status = 'registered' then occupied := occupied - 1; end if;
    new_status := case when not active then 'withdrawn' when existing.status = 'registered' or occupied < camp.capacity then 'registered' else 'waitlisted' end;
    if new_status = 'registered' then occupied := occupied + 1; end if;
    insert into public.camp_registrations
      (camp_id, participant_id, status, payment_status, amount, paid_at, expires_on, payment_method, payment_reference)
    values (p_camp_id, athlete, new_status, case when paid then 'paid' else 'unpaid' end,
      camp.price, case when paid then (camp.start_date::timestamp at time zone 'Indian/Maldives') else null end,
      case when paid then camp.end_date else null end, null, null)
    on conflict (camp_id, participant_id) do update set
      status = excluded.status, payment_status = excluded.payment_status,
      paid_at = case when paid and existing.payment_status in ('paid', 'expired') then existing.paid_at else excluded.paid_at end,
      expires_on = case when paid and existing.payment_status in ('paid', 'expired') then existing.expires_on else excluded.expires_on end,
      amount = case when paid and existing.payment_status in ('paid', 'expired') then existing.amount else excluded.amount end,
      payment_method = case when paid and existing.payment_status in ('paid', 'expired') then existing.payment_method else null end,
      payment_reference = case when paid and existing.payment_status in ('paid', 'expired') then existing.payment_reference else null end;
  end loop;
  return jsonb_array_length(p_rows);
end $$;
revoke all on function public.import_camp_participants(uuid, jsonb) from public, anon;
grant execute on function public.import_camp_participants(uuid, jsonb) to authenticated;
