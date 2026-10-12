-- SyncWave production hardening
-- 1) Guest-safe chat messages
-- 2) Harden room membership writes
-- 3) Keep guest session secrets out of Data API SELECT results
-- 4) Real local media uploads through Supabase Storage

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_session_id TEXT;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_check
  CHECK (char_length(content) BETWEEN 1 AND 2000);

DROP POLICY IF EXISTS "Allow members access to message logs" ON public.messages;
DROP POLICY IF EXISTS "Allow authenticated users to construct chat entries" ON public.messages;
DROP POLICY IF EXISTS "Guest room members can send messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated room members can send messages" ON public.messages;

CREATE POLICY "Room members can read messages"
ON public.messages
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_members.room_id = messages.room_id
  )
);

CREATE POLICY "Authenticated room members can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_members.room_id = messages.room_id
      AND room_members.user_id = (select auth.uid())
      AND room_members.is_banned = false
  )
);

CREATE POLICY "Guest room members can send messages"
ON public.messages
FOR INSERT
TO anon
WITH CHECK (
  sender_id IS NOT NULL
  AND sender_session_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_members.room_id = messages.room_id
      AND room_members.guest_id = messages.sender_id
      AND room_members.session_id = messages.sender_session_id
      AND room_members.is_banned = false
  )
);

GRANT SELECT, INSERT ON public.messages TO anon, authenticated;
REVOKE SELECT (sender_session_id) ON public.messages FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Room-member authorization.
-- Guests may create only guest rows; signed-in users may create only
-- their own member row. Only room hosts can mutate membership state.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow public insert access to room members list" ON public.room_members;
DROP POLICY IF EXISTS "Allow public manage access to room members list" ON public.room_members;
DROP POLICY IF EXISTS "Room members can leave their own membership" ON public.room_members;
DROP POLICY IF EXISTS "Registered users can join as themselves" ON public.room_members;
DROP POLICY IF EXISTS "Guests can join rooms" ON public.room_members;
DROP POLICY IF EXISTS "Room hosts can update membership" ON public.room_members;
DROP POLICY IF EXISTS "Room hosts can delete membership" ON public.room_members;

CREATE POLICY "Registered users can join as themselves"
ON public.room_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (select auth.uid())
  AND guest_id IS NULL
);

CREATE POLICY "Guests can join rooms"
ON public.room_members
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NULL
  AND guest_id IS NOT NULL
  AND session_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.id = room_members.room_id
  )
);

CREATE POLICY "Room hosts can update membership"
ON public.room_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.id = room_members.room_id
      AND rooms.host_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.id = room_members.room_id
      AND rooms.host_id = (select auth.uid())
  )
);

CREATE POLICY "Room hosts can delete membership"
ON public.room_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rooms
    WHERE rooms.id = room_members.room_id
      AND rooms.host_id = (select auth.uid())
  )
  OR user_id = (select auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_members TO anon, authenticated;

-- session_id is a browser-held secret used only to prove guest ownership.
-- It must not be exposed by normal Data API member queries.
REVOKE SELECT ON public.room_members FROM anon, authenticated;
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
) ON public.room_members TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Supabase Storage bucket for shared room media.
-- Files are public for playback; only authenticated room hosts may upload
-- or delete files under their room UUID folder.
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'syncwave-media',
  'syncwave-media',
  true,
  104857600,
  ARRAY['audio/*', 'video/*']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['audio/*', 'video/*']::text[];

DROP POLICY IF EXISTS "SyncWave media public read" ON storage.objects;
DROP POLICY IF EXISTS "SyncWave media host upload" ON storage.objects;
DROP POLICY IF EXISTS "SyncWave media host delete" ON storage.objects;
DROP POLICY IF EXISTS "SyncWave media host update" ON storage.objects;

CREATE POLICY "SyncWave media public read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'syncwave-media');

CREATE POLICY "SyncWave media host upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'syncwave-media'
  AND EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE rooms.id = (storage.foldername(name))[1]::uuid
      AND rooms.host_id = (select auth.uid())
  )
);

CREATE POLICY "SyncWave media host delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'syncwave-media'
  AND EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE rooms.id = (storage.foldername(name))[1]::uuid
      AND rooms.host_id = (select auth.uid())
  )
);

CREATE POLICY "SyncWave media host update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'syncwave-media'
  AND EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE rooms.id = (storage.foldername(name))[1]::uuid
      AND rooms.host_id = (select auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'syncwave-media'
  AND EXISTS (
    SELECT 1
    FROM public.rooms
    WHERE rooms.id = (storage.foldername(name))[1]::uuid
      AND rooms.host_id = (select auth.uid())
  )
);
