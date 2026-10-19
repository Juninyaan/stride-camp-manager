-- Camp pricing, payments with automatic expiry, medical profiles, and fitness vitals.
-- Safe to run more than once.

alter table public.camps
  add column if not exists price numeric(10, 2) not null default 0 check (price >= 0);

alter table public.participants
  add column if not exists date_of_birth date,
  add column if not exists blood_type text
    check (blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  add column if not exists allergies text,
  add column if not exists medical_conditions text,
  add column if not exists medications text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists medical_notes text;

-- A registration is 'pending' until payment is recorded, then 'registered'.
-- When the paid period ends it becomes 'expired' and the athlete leaves the camp roster.
alter table public.camp_registrations
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'expired')),
  add column if not exists amount numeric(10, 2) not null default 0 check (amount >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists expires_on date,
  add column if not exists payment_method text,
  add column if not exists payment_reference text;

alter table public.camp_registrations drop constraint if exists camp_registrations_status_check;
alter table public.camp_registrations add constraint camp_registrations_status_check
  check (status in ('pending', 'registered', 'waitlisted', 'expired', 'withdrawn'));
alter table public.camp_registrations alter column status set default 'pending';

-- Registrations created before payments existed are treated as paid through the camp end date.
update public.camp_registrations r
   set payment_status = 'paid',
       paid_at = coalesce(r.paid_at, r.registered_at),
       expires_on = coalesce(r.expires_on, c.end_date)
  from public.camps c
 where c.id = r.camp_id
   and r.status = 'registered'
   and r.payment_status = 'unpaid';

-- The app calls this on every load; it only touches the signed-in user's own rows.
create or replace function public.expire_overdue_registrations()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.camp_registrations
     set status = 'expired',
         payment_status = 'expired'
   where status = 'registered'
     and expires_on is not null
     and expires_on < current_date;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.expire_overdue_registrations() to authenticated;

-- Optional: expire registrations nightly for everyone, even if nobody opens the app.
-- Requires enabling the pg_cron extension (Database > Extensions) first, then run:
-- select cron.schedule(
--   'expire-camp-registrations', '5 0 * * *',
--   $$update public.camp_registrations
--        set status = 'expired', payment_status = 'expired'
--      where status = 'registered' and expires_on is not null and expires_on < current_date$$
-- );

create table if not exists public.participant_vitals (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recorded_on date not null default current_date,
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 30 and 260),
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 5 and 400),
  resting_heart_rate integer check (resting_heart_rate is null or resting_heart_rate between 20 and 250),
  systolic integer check (systolic is null or systolic between 50 and 260),
  diastolic integer check (diastolic is null or diastolic between 30 and 160),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists participant_vitals_participant_date_idx
  on public.participant_vitals (participant_id, recorded_on desc);

alter table public.participant_vitals enable row level security;

grant select, insert, update, delete on public.participant_vitals to authenticated;

drop policy if exists "Users can manage vitals for their participants" on public.participant_vitals;
create policy "Users can manage vitals for their participants"
  on public.participant_vitals for all to authenticated
  using (exists (
    select 1 from public.participants p
    where p.id = participant_vitals.participant_id
      and p.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.participants p
    where p.id = participant_vitals.participant_id
      and p.created_by = (select auth.uid())
  ));
