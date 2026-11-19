-- Enrollment and payment are independent. Apply after the earlier migrations.
alter table public.camps
  add column if not exists next_camp_id uuid references public.camps(id) on delete set null,
  add column if not exists rolled_over_at timestamptz;

create or replace function public.check_next_camp()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target public.camps%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.next_camp_id is not distinct from old.next_camp_id and new.end_date = old.end_date and new.start_date = old.start_date then return new; end if;
    if old.rolled_over_at is not null and (new.next_camp_id is distinct from old.next_camp_id or new.end_date <> old.end_date) then
      raise exception 'A camp that has already rolled over cannot change its successor or end date';
    end if;
  end if;
  if new.next_camp_id is not null then
    select * into target from public.camps where id = new.next_camp_id;
    if not found or target.created_by <> new.created_by or target.id = new.id then
      raise exception 'Choose another camp belonging to your account';
    end if;
    if target.start_date <= new.end_date then
      raise exception 'The next camp must start after this camp ends';
    end if;
  end if;
  if exists (select 1 from public.camps c where c.next_camp_id = new.id and c.end_date >= new.start_date) then
    raise exception 'This camp must start after its previous camp ends';
  end if;
  return new;
end $$;
drop trigger if exists check_next_camp on public.camps;
create trigger check_next_camp before insert or update of next_camp_id, end_date, start_date on public.camps
  for each row execute function public.check_next_camp();

create or replace function public.enforce_camp_capacity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare camp_capacity integer; occupied integer;
begin
  if new.status <> 'registered' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'registered' and old.camp_id = new.camp_id then return new; end if;
  select capacity into camp_capacity from public.camps where id = new.camp_id for update;
  if not found then raise exception 'Camp not found or access denied'; end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.camp_registrations
      where camp_id = new.camp_id and participant_id = new.participant_id and status = 'registered'
  ) then return new; end if;
  select count(*) into occupied from public.camp_registrations
    where camp_id = new.camp_id and status = 'registered';
  if occupied >= camp_capacity then
    raise exception 'Camp is full; add this athlete to the waitlist';
  end if;
  return new;
end $$;
drop trigger if exists enforce_camp_capacity on public.camp_registrations;
create trigger enforce_camp_capacity before insert or update of status, camp_id on public.camp_registrations
  for each row execute function public.enforce_camp_capacity();

-- Restore previously expired paid enrollments without changing withdrawn records.
-- Existing historical registrations are restored before enforcing capacity on
-- future changes; they may already exceed a camp's current capacity.
alter table public.camp_registrations disable trigger enforce_camp_capacity;
update public.camp_registrations set status = 'registered'
  where status = 'expired' and paid_at is not null;
alter table public.camp_registrations enable trigger enforce_camp_capacity;

create or replace function public.expire_overdue_registrations()
returns integer language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.camp_registrations set payment_status = 'expired'
    where payment_status = 'paid' and expires_on < (now() at time zone 'Indian/Maldives')::date;
  get diagnostics affected = row_count;
  return affected;
end $$;

-- Runs as a transaction; each camp is processed once and capacity is shared by
-- concurrent imports and rollover via a lock on the destination camp.
create or replace function public.rollover_due_camps()
returns integer language plpgsql security definer set search_path = '' as $$
declare source public.camps%rowtype; destination public.camps%rowtype;
  member record; occupied integer; processed integer := 0;
begin
  for source in select * from public.camps
    where next_camp_id is not null and rolled_over_at is null
      and end_date < (now() at time zone 'Indian/Maldives')::date
    order by end_date, id for update skip locked
  loop
    select * into destination from public.camps where id = source.next_camp_id for update;
    if not found or destination.created_by <> source.created_by or destination.start_date <= source.end_date then
      raise exception 'Invalid successor for camp %', source.id;
    end if;
    select count(*) into occupied from public.camp_registrations
      where camp_id = destination.id and status = 'registered';
    for member in
      select r.participant_id from public.camp_registrations r
      join public.participants p on p.id = r.participant_id and p.created_by = source.created_by
      where r.camp_id = source.id and r.status = 'registered'
      order by r.registered_at, r.id
    loop
      if not exists (select 1 from public.camp_registrations where camp_id = destination.id and participant_id = member.participant_id) then
        insert into public.camp_registrations
          (camp_id, participant_id, status, payment_status, amount, paid_at, expires_on)
        values (destination.id, member.participant_id,
          case when occupied < destination.capacity then 'registered' else 'waitlisted' end,
          case when destination.price = 0 then 'paid' else 'unpaid' end,
          destination.price,
          case when destination.price = 0 then now() else null end,
          case when destination.price = 0 then destination.end_date else null end);
        if occupied < destination.capacity then occupied := occupied + 1; end if;
      end if;
    end loop;
    update public.camps set rolled_over_at = now() where id = source.id;
    processed := processed + 1;
  end loop;
  return processed;
end $$;
revoke all on function public.rollover_due_camps() from public, anon, authenticated;

-- All rows succeed or the entire import is rolled back.
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
      insert into public.participants(first_name, last_name, email, guardian_name, guardian_email)
        values (trim(item->>'first_name'), trim(item->>'last_name'), nullif(trim(item->>'email'), ''),
          nullif(trim(item->>'guardian_name'), ''), nullif(trim(item->>'guardian_email'), ''))
        returning id into athlete;
    else
      athlete := (item->>'id')::uuid;
      if athlete = any(seen) then raise exception 'Row %: duplicate athlete ID', row_no; end if;
      seen := array_append(seen, athlete);
      update public.participants set first_name = trim(item->>'first_name'), last_name = trim(item->>'last_name'),
        email = nullif(trim(item->>'email'), ''), guardian_name = nullif(trim(item->>'guardian_name'), ''),
        guardian_email = nullif(trim(item->>'guardian_email'), '')
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

-- Disable the obsolete expiry job even before the replacement is installed.
do $$
declare job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for job in execute 'select jobid from cron.job where jobname = ''expire-camp-registrations''' loop
      execute format('select cron.unschedule(%s)', job.jobid);
    end loop;
  end if;
end $$;
