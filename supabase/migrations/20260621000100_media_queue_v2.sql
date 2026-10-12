-- SyncWave media queue schema alignment.
-- Add current media fields without dropping existing playlist rows.

CREATE TABLE IF NOT EXISTS public.media_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  track_id TEXT,
  track_name TEXT,
  artist_name TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  added_by_id UUID,
  added_by_guest_id UUID,
  added_by_name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_played BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  media_url TEXT,
  media_type TEXT,
  title TEXT,
  thumbnail_url TEXT,
  duration NUMERIC,
  added_by UUID
);

ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS duration NUMERIC;
ALTER TABLE public.media_queue ADD COLUMN IF NOT EXISTS added_by UUID;

-- Legacy track IDs that represent playable URLs or YouTube IDs remain usable.
UPDATE public.media_queue
SET
  media_url = COALESCE(
    media_url,
    CASE
      WHEN track_id ~* '^https?://' THEN track_id
      WHEN track_id ~ '^[A-Za-z0-9_-]{11}$' THEN 'https://www.youtube.com/watch?v=' || track_id
      ELSE NULL
    END
  ),
  media_type = COALESCE(
    media_type,
    CASE
      WHEN track_id ~ '^[A-Za-z0-9_-]{11}$' OR track_id ~* 'youtube\.com|youtu\.be' THEN 'youtube'
      WHEN COALESCE(track_id, '') ~* '\.(mp3|m4a|aac|wav|ogg|opus|flac)([?#].*)?$' THEN 'audio'
      ELSE 'video'
    END
  ),
  title = COALESCE(title, track_name, artist_name, 'Untitled media'),
  duration = COALESCE(duration, GREATEST(COALESCE(duration_ms, 0), 0)::NUMERIC / 1000),
  added_by = COALESCE(added_by, added_by_id, added_by_guest_id);

-- The app now writes media_url instead of legacy track_id.
ALTER TABLE public.media_queue ALTER COLUMN track_id DROP NOT NULL;
ALTER TABLE public.media_queue ALTER COLUMN media_type SET DEFAULT 'video';
ALTER TABLE public.media_queue ALTER COLUMN duration SET DEFAULT 0;
ALTER TABLE public.media_queue ALTER COLUMN is_played SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_media_queue_room ON public.media_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_media_queue_position ON public.media_queue(room_id, position);
ALTER TABLE public.media_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to media queue" ON public.media_queue;
DROP POLICY IF EXISTS "Allow public write access to media queue" ON public.media_queue;
DROP POLICY IF EXISTS "Allow room host to insert media queue" ON public.media_queue;
DROP POLICY IF EXISTS "Allow room host to update media queue" ON public.media_queue;
DROP POLICY IF EXISTS "Allow room host to delete media queue" ON public.media_queue;
DROP POLICY IF EXISTS "Room members can read media queue" ON public.media_queue;

CREATE POLICY "Room members can read media queue"
ON public.media_queue FOR SELECT TO public
USING (EXISTS (SELECT 1 FROM public.room_members WHERE room_members.room_id = media_queue.room_id));

CREATE POLICY "Room host can insert media queue"
ON public.media_queue FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

CREATE POLICY "Room host can update media queue"
ON public.media_queue FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

CREATE POLICY "Room host can delete media queue"
ON public.media_queue FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_queue TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'media_queue'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.media_queue;
  END IF;
END $$;
