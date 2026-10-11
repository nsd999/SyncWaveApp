# SyncWave — Restored Product Notes and Portal UX

## Product intent recovered from saved SyncWave design files

SyncWave is a shared media space where a host can create a listening/watching room, invite other people with a room code or link, and keep media playback aligned for everyone. The saved design headline was “Ride the Frequency. Experience media, exactly together.” The saved landing concept was named “SyncWave — Premium Landing Page”; the saved live-room concept used the Midnight Neon styling.

The archived prototype specified a home/room experience with a media player, playback controls, an active queue, live room chat, participant list, and mobile-oriented navigation. The archived database note described user profiles, rooms, room membership, media tracks, a playback state, a queue, and messages.

## Implementation observed in the GitHub branch

The existing repository is a Next.js 15 App Router project using React 19, TypeScript, Tailwind CSS 4, Motion, Lucide, Supabase, and Vercel. The current database migrations use Supabase/PostgreSQL tables including profiles, rooms, room_members, room_permissions, join_requests, messages, playback_state, room_activity, trusted_users, media_queue, presence, and guest_sessions.

The current codebase contains these main capabilities and paths:

- **Identity:** Supabase email/password authentication and Google OAuth entry points, with an auth callback route and profile initialization.
- **Room lifecycle:** authenticated users can create rooms; visitors can validate a room code and join as guests; rooms can be public or private.
- **Playback:** a playback sync service persists and subscribes to playback state; the room UI exposes supported media playback controls and queue operations.
- **Collaboration:** participant presence, live chat, host/member controls, moderation states, and invite link/code sharing.
- **Integrations:** YouTube Data API metadata lookup and Telegram bot/linking integration where configured.
- **Operations and security:** an admin route, server/API routes, Supabase migrations, row-level access policies, storage policies, and the previous `fix/syncwave-core-audit` work.

The archived design mockups are concept references, not proof that every described behavior is active in production. A deployment still needs valid environment variables, current database migrations, OAuth redirect configuration, and a build/runtime check.

## New visual direction

The latest requested direction supersedes the old neon visual language. Use the information hierarchy of a straightforward self-service portal: clear product identity, a visible service/context strip, a small number of primary actions, grouped cards, concise help text, human-readable errors, clear states, and a guided workflow.

Use these principles without reusing BSNL logos or presenting SyncWave as a government service:

1. **Calm palette:** portal blue for primary actions, pale blue-gray canvas, white cards, neutral text, and restrained orange for emphasis.
2. **Clear hierarchy:** product/service label first, page heading second, primary action third, details after that.
3. **Guided entry:** (1) create or join a room, (2) choose supported media, (3) listen/watch together.
4. **Honest status:** show actual connection or room states. Do not present hard-coded usage statistics as live data.
5. **Readable forms:** persistent labels, visible focus states, appropriately sized text, clear error wording, and touch-friendly controls.
6. **Responsive layout:** wrap header actions on narrow screens, keep dialogs within the viewport, and preserve access to room tools on mobile.
7. **Functional consistency:** retain existing authentication, media, chat, queue, presence, host moderation, and sharing behavior while changing the presentation layer.

## Route guidance

- **Home (`/`):** explain the product, show Create Room and Join Room as the dominant actions, disclose that hosting requires sign-in and guests can join by code, and present the 3-step workflow.
- **Login and signup:** keep Google and email/password paths explicit, display user-facing errors, and avoid terminal/handshake jargon in normal flows.
- **Dashboard (`/dashboard`):** lead with a workspace heading, keep create/join actions obvious, separate profile details from rooms, and only display real counts.
- **Room (`/room/[code]`):** prioritize the player, room identity/code, play queue, participants, chat and host controls. Preserve safe mobile spacing and human-readable recovery states.
- **Admin (`/admin`):** treat operational diagnostics as a separate privileged area and retain existing authorization checks.

## Reference

Visual inspiration: https://sahaj.bsnl.co.in/. The goal is the clarity and self-service flow of the portal, not a pixel-for-pixel copy of its UI, brand assets, or government identity.