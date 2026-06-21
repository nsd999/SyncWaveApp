-- =====================================================================
-- SYNCWAVE PHASE 3.1 - REAL-TIME PLAYBACK SYNCHRONIZATION FOUNDATION
-- Migration script to recreate public.playback_state with required columns
-- =====================================================================

-- 1. Drop existing table if any
DROP TABLE IF EXISTS public.playback_state CASCADE;

-- 2. Create public.playback_state
CREATE TABLE public.playback_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    media_url TEXT,
    media_type TEXT,
    is_playing BOOLEAN DEFAULT FALSE,
    current_time NUMERIC DEFAULT 0,
    duration NUMERIC DEFAULT 0,
    playback_rate NUMERIC DEFAULT 1,
    updated_by UUID,
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id)
);

-- 3. Create Index
CREATE INDEX IF NOT EXISTS idx_playback_state_room
ON public.playback_state(room_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;

-- 5. Define SELECT policy
CREATE POLICY "Allow public read access to playback synchronizer"
ON public.playback_state FOR SELECT TO public
USING (
    EXISTS (
        SELECT 1 FROM public.room_members
        WHERE room_members.room_id = playback_state.room_id
    )
);

-- 6. Define INSERT policy
CREATE POLICY "Allow room host to create playback state"
ON public.playback_state FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

-- 7. Define UPDATE policy
CREATE POLICY "Allow room host to update playback state"
ON public.playback_state FOR UPDATE TO public
USING (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

-- 8. Define DELETE policy
CREATE POLICY "Allow room host to remove playback state"
ON public.playback_state FOR DELETE TO public
USING (
    EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
    )
);

-- 9. Trigger for updating updated_at timestamp
CREATE OR REPLACE TRIGGER update_playback_state_updated_at
    BEFORE UPDATE ON public.playback_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Enable Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
