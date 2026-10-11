-- SyncWave: keep guest session credentials out of Data API reads while allowing
-- room UI projections to load without SELECT * permission errors.
BEGIN;

REVOKE SELECT ON TABLE public.room_members FROM anon, authenticated;
GRANT SELECT (
  id,
  room_id,
  user_id,
  guest_id,
  display_name,
  role,
  joined_at,
  is_host,
  is_muted,
  is_banned
) ON TABLE public.room_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.room_members TO anon, authenticated;

-- A table-level SELECT grant overrides a column-level revoke. Revoke table-wide
-- reads and grant only the columns the room UI needs; sender_session_id remains
-- available to INSERT policy checks but not to normal Data API SELECT queries.
REVOKE SELECT ON TABLE public.messages FROM anon, authenticated;
GRANT SELECT (
  id,
  room_id,
  sender_id,
  content,
  created_at
) ON TABLE public.messages TO anon, authenticated;
GRANT INSERT ON TABLE public.messages TO anon, authenticated;

COMMIT;
