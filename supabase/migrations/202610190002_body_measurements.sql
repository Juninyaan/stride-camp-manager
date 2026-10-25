-- Body composition and body measurements for fitness tracking. Safe to run more than once.
-- Requires 202610190001_payments_and_health.sql (it creates participant_vitals).

alter table public.participant_vitals
  add column if not exists bmi numeric(4, 1) check (bmi is null or bmi between 5 and 80),
  add column if not exists body_fat_pct numeric(4, 1) check (body_fat_pct is null or body_fat_pct between 1 and 70),
  add column if not exists waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 20 and 250),
  add column if not exists hip_cm numeric(5, 1) check (hip_cm is null or hip_cm between 20 and 250),
  add column if not exists chest_cm numeric(5, 1) check (chest_cm is null or chest_cm between 20 and 250),
  add column if not exists arm_cm numeric(4, 1) check (arm_cm is null or arm_cm between 5 and 100),
  add column if not exists thigh_cm numeric(4, 1) check (thigh_cm is null or thigh_cm between 10 and 150);
