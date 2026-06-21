-- =====================================================================
-- SYNCWAVE PHASE 3.2 - MEDIA QUEUE DATABASE SCHEMAS
-- Migration script to recreate public.media_queue with custom columns
-- =====================================================================

-- 1. Drop existing table
DROP TABLE IF EXISTS public.media_queue CASCADE;

-- 2. Create public.media_queue
CREATE TABLE public.media_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'video',
    title TEXT,
    thumbnail_url TEXT,
    duration NUMERIC DEFAULT 0,
    added_by UUID, -- Can be public.profiles.id or anonymous uuid
    added_by_name TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_played BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Index
CREATE INDEX IF NOT EXISTS idx_media_queue_room
ON public.media_queue(room_id);

CREATE INDEX IF NOT EXISTS idx_media_queue_position
ON public.media_queue(room_id, position);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.media_queue ENABLE ROW LEVEL SECURITY;

-- 5. Define SELECT policy (Allow all room participants to read media queue)
CREATE POLICY "Allow public read access to media queue"
ON public.media_queue FOR SELECT TO public
USING (true);

-- 6. Define INSERT/UPDATE/DELETE policies (Restricted to room hosts only)
CREATE POLICY "Allow room host to insert media queue"
ON public.media_queue FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

CREATE POLICY "Allow room host to update media queue"
ON public.media_queue FOR UPDATE TO public
USING (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

CREATE POLICY "Allow room host to delete media queue"
ON public.media_queue FOR DELETE TO public
USING (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

-- 7. Add to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_queue;
