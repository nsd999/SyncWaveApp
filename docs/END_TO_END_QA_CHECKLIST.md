# SyncWave end-to-end QA checklist

## Current verification state

- Browser smoke tests on the Vercel preview verified the homepage renders, the signed-out Create Room dialog opens, Cancel closes it, Sign In/Sign Up navigate to their forms, and `/admin` redirects to login.
- A deliberately invalid room code and a direct invalid-room URL exposed a Supabase request timeout. The preview did not receive a PostgREST not-found status; requests were aborted before a response.
- Vercel's environment inspection currently returns no value for `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The room backend therefore cannot be tested until the intended database is configured.
- Code review found and patched missing/overbroad column projections, guest-session token loss during member refresh, missing explicit playhead updates for direct media, duplicate YouTube play/pause writes, false-positive host moderation status, silently swallowed chat sends, false-positive playback writes, missing message Realtime publication setup, and destructive playback/queue reset migrations.
- No signed-in host + guest session was created during QA. No real YouTube/audio/video stream was played with two participants, and no SQL migration was applied to an unverified database.

## Required setup before live-room testing

- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` to the intended SyncWave Supabase project.
- [ ] Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the supported legacy anon key). Never expose a service-role key in frontend variables.
- [ ] Confirm the URL and key belong to the same Supabase project, then redeploy the current GitHub branch.
- [ ] Apply the bootstrap schema only for a new project. For a populated project, inspect the schema first and apply the appropriate timestamped migrations without rerunning the bootstrap blindly.
- [ ] Verify the `syncwave-media` storage bucket and host-only upload policies.
- [ ] Enable Email/Password and Google providers and configure exact redirect URLs in Supabase Auth.
- [ ] Verify `messages`, `room_members`, `playback_state`, `media_queue`, and `rooms` are in the `supabase_realtime` publication.

## Host + guest journey

- [ ] Open SyncWave in a desktop browser, register or sign in, and verify the redirect returns to the app.
- [ ] Create a public room; confirm a code is shown and copying/sharing it yields a usable invite link.
- [ ] Open the invite in a second browser/device as a guest; choose a display name and join successfully.
- [ ] Confirm both users appear in participants/presence, and that a third browser or refresh restores room membership correctly.
- [ ] Send chat in both directions; test typing indicators, reconnects, and a failed-send recovery without losing the draft.
- [ ] As host, load the Big Buck Bunny MP4 preset, play/pause, seek, change playback speed, and verify the guest stays within about 2 seconds after buffering/network delay.
- [ ] Add a second MP4 and an MP3/audio URL to the queue. Test Next and automatic queue advancement after Ended; verify only one client advances the shared queue.
- [ ] Add a YouTube URL in watch, youtu.be, embed, live, and Shorts formats. Verify the same video ID loads, the guest follows host play/pause/seek, and autoplay-block prompts work.
- [ ] Test a YouTube video with embedding disabled; the app should explain the restriction and offer an Open on YouTube fallback.
- [ ] Upload a small MP3 and MP4; check queue insertion, cross-client playback, 100 MB validation, invalid file type rejection, and failure cleanup.
- [ ] Test host mute, kick, and ban; verify errors are surfaced, removed users lose room access, and banned users cannot rejoin.
- [ ] Refresh both clients during playback and reconnect after a network interruption; verify the authoritative playback time and room state are restored.
- [ ] Test mobile browsers around 360–430 CSS pixels with real viewport emulation. Check no horizontal overflow, controls hidden under navigation, clipped dialogs, and accessible playback gestures.

## Regression checks

- [ ] Apply the column-permission and Realtime publication migrations to the intended database and confirm safe column queries no longer return permission errors.
- [ ] Run a production build and static checks after the final code changes.
- [ ] Repeat the complete host/guest journey against the deployed build after database configuration; a successful preview build alone does not verify media playback.

## Current blocker

The Vercel environment is missing values for the Supabase URL and publishable key. Until those are set and the matching schema is applied to that same project, database-backed flows (authentication, room creation/joining, chat, presence, queue, uploads, and synchronized playback) cannot be marked end-to-end passed.