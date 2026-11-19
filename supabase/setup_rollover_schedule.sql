-- Run in the Supabase SQL Editor after enabling the pg_cron extension.
-- Replaces the old expiry-only job, which would otherwise remove athletes.
select cron.unschedule(jobid)
  from cron.job
 where jobname in ('expire-camp-registrations', 'stride-monthly-rollover');

-- 19:05 UTC is 00:05 in the Maldives, just after the camp's end date.
select cron.schedule(
  'stride-monthly-rollover',
  '5 19 * * *',
  'select public.expire_overdue_registrations(); select public.rollover_due_camps();'
);
