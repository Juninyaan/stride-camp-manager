-- Keep sessions inside their camp's dates. Safe to run more than once.
-- The app enforces exact dates; this guard allows one day of slack either side
-- because session times are stored in UTC and users may be in another time zone.

create or replace function public.enforce_session_within_camp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  camp_start date;
  camp_end date;
  session_day date := (new.starts_at at time zone 'UTC')::date;
begin
  select start_date, end_date into camp_start, camp_end
    from public.camps
   where id = new.camp_id;

  if camp_start is not null and (session_day < camp_start - 1 or session_day > camp_end + 1) then
    raise exception 'Session date must fall within the camp dates (% to %)', camp_start, camp_end;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_within_camp on public.sessions;
create trigger sessions_within_camp
  before insert or update of starts_at, camp_id on public.sessions
  for each row execute function public.enforce_session_within_camp();
