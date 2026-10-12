# SyncWave

SyncWave is a shared media-room web app for watching or listening with friends. A host can create a room and share its code or link; guests can join without creating an account. Room features include synchronized playback, a shared media queue, participant presence, live chat, and host moderation controls.

## Technology

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS 4
- **UI:** Lucide icons and Motion animations
- **Authentication and data:** Supabase Auth and PostgreSQL
- **Live features:** Supabase Realtime subscriptions and the playback sync service
- **Deployment target:** Vercel

## Local development

Prerequisite: a Node.js version compatible with the Next.js 15 project.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set your Supabase project URL and browser-safe publishable key (or legacy anon key). Set optional integration keys only for features you use.
4. Start the development server with `npm run dev`.

Useful commands:

- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run start` — serve a completed production build

Never commit `.env.local`, service-role keys, bot tokens, or other private credentials. The `.env.example` file is a template, not a working configuration.

## Main routes

- `/` — create or join a room and learn how SyncWave works
- `/login` and `/signup` — email/password and Google sign-in entry points
- `/dashboard` — profile, room creation, room-code join, and room discovery
- `/room/[code]` — synchronized playback, chat, queue, presence, and host controls
- `/admin` — administrative tools

For a **new** Supabase project, run `supabase/migrations/schema_and_profiles.sql` in the SQL Editor first, then apply the timestamped migrations in chronological order. That bootstrap script is for initial setup; do not blindly rerun it against a populated database. The playback-state and media-queue alignment migrations are additive and preserve existing rows.

Before testing rooms, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the supported legacy anon key) in Vercel for both Preview and Production, then redeploy. Never use a service-role key in a `NEXT_PUBLIC_*` variable. Apply the migrations to the exact Supabase project configured in Vercel, not an unrelated project.

See `docs/END_TO_END_QA_CHECKLIST.md` for what has been checked and the remaining multi-user verification steps.

## UX direction

The original prototype used a dark Midnight Neon look. The current portal pass retains SyncWave's blue media identity but prioritizes calm light surfaces, readable labels, clear entry actions, guided room steps, keyboard focus states, and mobile layouts. It is inspired by the information hierarchy and self-service clarity of service portals such as BSNL SAHAJ/SKYC, without copying their branding or presenting SyncWave as a government service.

See `docs/RESTORED_PRODUCT_AND_PORTAL_UX.md` for the detailed intent and route-by-route design decisions.