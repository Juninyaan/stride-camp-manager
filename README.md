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
2. Apply [the initial schema](supabase/migrations/202610160001_initial_schema.sql) in the Supabase SQL Editor (or with the Supabase CLI).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. An anon key may also be used as a fallback. Never put a service-role or secret key in a `NEXT_PUBLIC_` variable.
4. Restart `npm run dev`, create an account in the app, and confirm the email if Supabase email confirmation is enabled.

With credentials configured, camps can be created, listed, edited, and deleted in Supabase. Without credentials, the dashboard remains in sample-data demo mode. The migration also creates the participant, registration, session, and attendance tables for the next workflow slice; their dashboard screens are still illustrative.

The first schema scopes every record to its creator using row-level security; it does not yet implement shared workspaces or admin/coach roles. Those access rules should be confirmed before inviting multiple staff members to share data.
