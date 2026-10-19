-- Stride Camp Manager initial schema
-- Data is private to the authenticated account that created it. Team sharing and
-- role-based access should be added after the workspace/coach rules are agreed.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.camps (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  location text not null check (char_length(trim(location)) between 1 and 200),
  start_date date not null,
  end_date date not null,
  age_group text not null check (char_length(trim(age_group)) between 1 and 60),
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camps_date_range check (end_date >= start_date)
);

create index if not exists camps_created_by_start_date_idx
  on public.camps (created_by, start_date);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  email text,
  guardian_name text,
  guardian_email text,
  created_at timestamptz not null default now()
);

create index if not exists participants_created_by_name_idx
  on public.participants (created_by, last_name, first_name);

create table if not exists public.camp_registrations (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  status text not null default 'registered'
    check (status in ('registered', 'waitlisted', 'withdrawn')),
  registered_at timestamptz not null default now(),
  unique (camp_id, participant_id)
);

create index if not exists camp_registrations_camp_status_idx
  on public.camp_registrations (camp_id, status);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  created_at timestamptz not null default now(),
  constraint sessions_time_range check (ends_at > starts_at)
);

create index if not exists sessions_camp_starts_at_idx
  on public.sessions (camp_id, starts_at);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'excused')),
  marked_by uuid not null default auth.uid() references auth.users (id),
  marked_at timestamptz not null default now(),
  unique (session_id, participant_id)
);

create index if not exists attendance_session_status_idx
  on public.attendance (session_id, status);

alter table public.profiles enable row level security;
alter table public.camps enable row level security;
alter table public.participants enable row level security;
alter table public.camp_registrations enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.camps to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, insert, update, delete on public.camp_registrations to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can read their own camps" on public.camps;
create policy "Users can read their own camps"
  on public.camps for select to authenticated
  using (created_by = (select auth.uid()));
drop policy if exists "Users can create their own camps" on public.camps;
create policy "Users can create their own camps"
  on public.camps for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists "Users can update their own camps" on public.camps;
create policy "Users can update their own camps"
  on public.camps for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
drop policy if exists "Users can delete their own camps" on public.camps;
create policy "Users can delete their own camps"
  on public.camps for delete to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "Users can manage their own participants" on public.participants;
create policy "Users can manage their own participants"
  on public.participants for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists "Users can read registrations for their camps" on public.camp_registrations;
create policy "Users can read registrations for their camps"
  on public.camp_registrations for select to authenticated
  using (exists (
    select 1 from public.camps c
    where c.id = camp_registrations.camp_id
      and c.created_by = (select auth.uid())
  ));
drop policy if exists "Users can manage registrations for their camps and participants" on public.camp_registrations;
create policy "Users can manage registrations for their camps and participants"
  on public.camp_registrations for all to authenticated
  using (exists (
    select 1 from public.camps c
    join public.participants p on p.id = camp_registrations.participant_id
    where c.id = camp_registrations.camp_id
      and c.created_by = (select auth.uid())
      and p.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.camps c
    join public.participants p on p.id = camp_registrations.participant_id
    where c.id = camp_registrations.camp_id
      and c.created_by = (select auth.uid())
      and p.created_by = (select auth.uid())
  ));

drop policy if exists "Users can manage sessions for their camps" on public.sessions;
create policy "Users can manage sessions for their camps"
  on public.sessions for all to authenticated
  using (exists (
    select 1 from public.camps c
    where c.id = sessions.camp_id
      and c.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.camps c
    where c.id = sessions.camp_id
      and c.created_by = (select auth.uid())
  ));

drop policy if exists "Users can manage attendance for their camps" on public.attendance;
create policy "Users can manage attendance for their camps"
  on public.attendance for all to authenticated
  using (exists (
    select 1
    from public.sessions s
    join public.camps c on c.id = s.camp_id
    join public.participants p on p.id = attendance.participant_id
    where s.id = attendance.session_id
      and c.created_by = (select auth.uid())
      and p.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.sessions s
    join public.camps c on c.id = s.camp_id
    join public.participants p on p.id = attendance.participant_id
    where s.id = attendance.session_id
      and c.created_by = (select auth.uid())
      and p.created_by = (select auth.uid())
  ));
