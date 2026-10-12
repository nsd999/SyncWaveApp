-- SyncWave playback schema alignment.
-- This migration is additive: existing room playback rows are preserved.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.playback_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL UNIQUE REFERENCES public.rooms(id) ON DELETE CASCADE,
  media_url TEXT,
  media_type TEXT,
  is_playing BOOLEAN DEFAULT FALSE,
  current_time NUMERIC,
  duration NUMERIC,
  playback_rate NUMERIC,
  updated_by UUID,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Legacy columns retained so this migration never destroys prior state.
  track_id TEXT,
  track_name TEXT,
  artist_name TEXT,
  duration_ms INTEGER DEFAULT 0,
  progress_ms INTEGER DEFAULT 0,
  updated_by_id UUID
);

ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS current_time NUMERIC;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS duration NUMERIC;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS playback_rate NUMERIC;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.playback_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Convert legacy track IDs/progress where they can be interpreted safely.
UPDATE public.playback_state
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
      ELSE 'video'
    END
  ),
  current_time = COALESCE(current_time, GREATEST(COALESCE(progress_ms, 0), 0)::NUMERIC / 1000, 0),
  duration = COALESCE(duration, GREATEST(COALESCE(duration_ms, 0), 0)::NUMERIC / 1000, 0),
  playback_rate = COALESCE(playback_rate, 1),
  updated_by = COALESCE(updated_by, updated_by_id),
  last_sync_at = COALESCE(last_sync_at, updated_at, NOW()),
  created_at = COALESCE(created_at, updated_at, NOW()),
  updated_at = COALESCE(updated_at, last_sync_at, NOW());

ALTER TABLE public.playback_state ALTER COLUMN current_time SET DEFAULT 0;
ALTER TABLE public.playback_state ALTER COLUMN duration SET DEFAULT 0;
ALTER TABLE public.playback_state ALTER COLUMN playback_rate SET DEFAULT 1;
ALTER TABLE public.playback_state ALTER COLUMN last_sync_at SET DEFAULT NOW();
ALTER TABLE public.playback_state ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.playback_state ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.playback_state ALTER COLUMN last_sync_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playback_state_room ON public.playback_state(room_id);
ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to playback synchronizer" ON public.playback_state;
DROP POLICY IF EXISTS "Allow room members & co-hosts update permission" ON public.playback_state;
DROP POLICY IF EXISTS "Allow room host to create playback state" ON public.playback_state;
DROP POLICY IF EXISTS "Allow room host to update playback state" ON public.playback_state;
DROP POLICY IF EXISTS "Allow room host to remove playback state" ON public.playback_state;

CREATE POLICY "Room members can read playback state"
ON public.playback_state FOR SELECT TO public
USING (EXISTS (SELECT 1 FROM public.room_members WHERE room_members.room_id = playback_state.room_id));

CREATE POLICY "Room host can create playback state"
ON public.playback_state FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

CREATE POLICY "Room host can update playback state"
ON public.playback_state FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

CREATE POLICY "Room host can delete playback state"
ON public.playback_state FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rooms WHERE rooms.id = room_id AND rooms.host_id = (select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playback_state TO anon, authenticated;

CREATE OR REPLACE TRIGGER update_playback_state_updated_at
  BEFORE UPDATE ON public.playback_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'playback_state'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
  END IF;
END $$;
