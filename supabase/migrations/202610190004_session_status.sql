-- Let sessions be cancelled (rain, weather, etc.) and later rescheduled. Safe to run more than once.

alter table public.sessions
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  add column if not exists cancel_reason text;
