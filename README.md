# Stride Camp Manager

A responsive dashboard prototype for managing sports camps, schedules, and participants.

## Stack

- Next.js with React and TypeScript
- Tailwind CSS
- Supabase JS and SSR clients for PostgreSQL-backed services and cookie-backed authentication
- Recharts for data visualization
- Lucide for icons

## Getting started

Install dependencies with `npm install`, then run `npm run dev` and open the local URL printed by Next.js.

Use `npm run lint` to check the code and `npm run build` to create a production build.

## Supabase setup

1. Create a Supabase project.
2. Apply the SQL files in `supabase/migrations` **in order** in the Supabase SQL Editor (or with the Supabase CLI): [the initial schema](supabase/migrations/202610160001_initial_schema.sql), [payments and health records](supabase/migrations/202610190001_payments_and_health.sql), [body measurements](supabase/migrations/202610190002_body_measurements.sql), [session date guard](supabase/migrations/202610190003_session_dates.sql), [session status](supabase/migrations/202610190004_session_status.sql), [bulk import and rollover](supabase/migrations/202610190005_bulk_and_rollover.sql), and [athlete phone numbers](supabase/migrations/202610190006_participant_phone.sql).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. An anon key may also be used as a fallback. Never put a service-role or secret key in a `NEXT_PUBLIC_` variable.
4. Restart `npm run dev`, create an account in the app, and confirm the email if Supabase email confirmation is enabled.

With credentials configured, camps, athletes, registrations, payments, sessions, attendance, and health records are stored in Supabase. Without credentials, the app runs in sample-data demo mode.

## Payments and expiry

- Enrollment and payment are separate: an active athlete can appear on the roster and attendance sheet while unpaid. Unpaid and expired payments are shown on the dashboard and camp/athlete records.
- A payment has a **valid until** date (defaults to the camp end date). After that date the payment becomes **Expired**, but enrollment and attendance history remain intact. Removing an athlete from a camp marks the registration inactive instead of deleting its history.
- Expiry is applied when the app loads. For unattended expiry and rollover, enable `pg_cron` in Supabase, then run [the scheduling script](supabase/setup_rollover_schedule.sql) in the SQL Editor. It replaces the old expiry-only job, which would otherwise remove athletes, and runs daily at 00:05 Maldives time. Check `cron.job` and `cron.job_run_details` in Supabase to confirm scheduling and diagnose failures. The schedule must be installed separately in each Supabase project.
- Camp prices use the currency code in `NEXT_PUBLIC_CURRENCY` (defaults to `MVR`).

### Bulk import and monthly rollover

On **Athlete records**, choose a camp and download the CSV template, export its athletes, or export all athletes to assign existing people to a new camp. In an all-athlete export, people not yet in the selected camp default to active and unpaid; remove rows you do not want to assign. Fill in `first_name`, `last_name`, `active` (`active` or `inactive`) and `paid` (`paid` or `unpaid`); other columns may be blank, but all headers must remain. Leave `id` blank to create an athlete, or use the ID from an export to update an existing athlete. Names and email are not used for matching. Use one row per athlete, up to 1,000 rows and 1 MB per file. Existing profile fields in the file replace the corresponding values, including blanks. Exported formula-like values are protected with an apostrophe and restored when imported.

A single period (`.`) in an optional field (`id`, `email`, `phone`, `guardian_name`, or `guardian_email`) is treated as blank. For existing athletes, blank or period profile values clear the corresponding saved fields; a blank or period ID creates a new athlete instead of updating one. Older CSV templates without a `phone` column remain valid and preserve existing phone numbers. Use the new template or an export to add or change phone numbers; include the country code when appropriate.

The import validates the file before submission and saves it in one database transaction. Active athletes enter the roster when capacity is available; overflow is waitlisted. Inactive keeps history. A new paid entry defaults to the camp price, start date and end date; existing payment details are retained when already paid. Changing paid to unpaid clears the recorded payment details. Review the file before importing.

On a camp page, choose its **Next monthly camp** explicitly. After the current camp ends, the scheduled job copies active athletes into the linked camp as unpaid (free camps are paid automatically), placing overflow on the waitlist. Existing registrations in the destination are never overwritten, and the original camp and its history remain intact. The next camp must start after the previous camp ends. Once rollover runs, the link cannot be changed. Rollover requires the scheduled job above; demo mode does not persist or run it.

On a camp's session calendar, expand **Bulk import sessions from CSV** and download the session template. Enter `title`, `date` (YYYY-MM-DD), `start_time` and `end_time` (24-hour HH:MM). Dates must be within the selected camp, and end times must be later than start times. Upload up to 1,000 rows and 1 MB per file. Rows matching an existing session or an earlier CSV row on date and start time are skipped. The import uses the currently loaded calendar; reload first if another user may have changed it. Demo-mode imports are not saved after a refresh.

On the camp page, use **Manage sessions** to select and delete several sessions; the confirmation shows how many attendance records will also be deleted. **Add athlete** creates a person or adds an existing person to that camp, including placing them on the waitlist when full. Use **Edit** beside a roster entry to change contact details. The add-athlete and add-session forms offer **Save and add another**.

## Camps and athlete records

Click a camp (on the overview or the **Camps** page) to see everyone in it with their payment status, valid-until date and attendance; filter by Paid, Not paid, Waitlisted or Expired. From there open any athlete's record, and from an athlete's record click a camp name to return to that camp. The **Athlete records** page can also be filtered by camp.

### Camp sessions

Each camp page shows its sessions on a **calendar** covering the camp's days. Click a day to see its sessions in detail (who was present, absent, excused or not marked) and take or edit attendance. Drag a session onto another day to move it. Past days show a small attendance summary (for example "3/4 present"). A session can be marked **Cancelled** (for example because of rain) with a reason; it stays on the calendar struck through, and **Reschedule** (or dragging it to another day) puts it back on the schedule. You can also edit, duplicate a session onto selected days or the whole camp, add sessions across several days, or delete them. Cancelled sessions are left out of the dashboard schedule and attendance figures. On touch screens, use **Edit** to change a date because drag and drop needs a mouse. Sessions can only be dated inside the camp's start and end dates (the app enforces this exactly; the database blocks anything more than a day outside as a safety net), and a camp's dates cannot be changed to exclude sessions that already exist.

When adding sessions across several days, the location selects an editable default: Malé uses Monday, Wednesday and Saturday; Hulhumalé uses Sunday, Monday and Thursday. Both default to 20:00–21:00. Use the weekday buttons or individual dates to change the selection. Existing sessions with the same start time on a selected date are skipped when adding a new schedule. Existing camps with another location keep their current location and initially select all camp days.

For one selected athlete the record shows: camps completed with Stride, payments, attendance and regularity, a medical profile (allergies, conditions, medications, emergency contact), and fitness measurements over time: height, weight, BMI (calculated automatically unless entered), body fat %, waist/hip/chest/arm/thigh measurements, resting heart rate, and blood pressure, with trends against the previous record. Medical data is sensitive: it is private to the account that created it, so review local privacy requirements before storing it.

The first schema scopes every record to its creator using row-level security; it does not yet implement shared workspaces or admin/coach roles. Those access rules should be confirmed before inviting multiple staff members to share data.
#   s t r i d e - c a m p - m a n a g e r 
 
 