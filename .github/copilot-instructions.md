# Stride Camp Manager — Copilot Instructions

## Project stack
- Next.js App Router with React and TypeScript.
- Tailwind CSS for styling.
- Supabase/PostgreSQL for backend services and authentication; role-based access should be designed with the confirmed workflows.
- Recharts for data visualization and Lucide for icons.

## Development conventions
- Keep the application responsive and accessible.
- Keep secrets in environment variables; use `.env.example` to document required names without values.
- Do not assume business workflows, roles, or database policies that have not been specified.
- Run `npm run lint` and `npm run build` after code changes.

## Current status
- Workspace renamed to `stride-camp-manager`.
- Responsive camp-management dashboard implemented; camp list and create/edit/delete operations use Supabase when credentials and the initial migration are configured.
- Email/password Supabase authentication is implemented; demo mode remains available without credentials.
- The initial RLS schema isolates data to its creating account; shared workspaces and role policies are not yet configured.
- Participant, session, and attendance screens still use illustrative data and are next to connect.
