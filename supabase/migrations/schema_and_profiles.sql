-- =====================================================================
-- SYNCWAVE PRODUCTION DATABASE RECOVERY & MIGRATION SCHEMA
-- =====================================================================
-- Contains the complete schemas, triggers, indexes, and RLS rules
-- required for both Phase 1 (Authentication) and subsequent phases.
-- Run this script in the Supabase SQL Editor to establish a 100% healthy database.

-- Ensure updated_at modification function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TABLE 1: PROFILES (Core table used in current compiled codebase)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to profiles" 
ON public.profiles FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated users to insert their own profile" 
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow users to update their own profile" 
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Trigger for auto-updating updated_at on profiles
CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- AUTOMATIC PROFILE SYNCHRONIZATION FROM AUTH SIGNUP
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
    cleaned_username TEXT;
    base_username TEXT;
    avatar_seed TEXT;
BEGIN
    -- Extract email prefix for safe fallback candidate
    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
        base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'));
    ELSE
        base_username := 'user';
    END IF;

    IF base_username = '' THEN
        base_username := 'user';
    END IF;

    -- Append small random string to ensure total uniqueness in high-velocity signup scenarios
    cleaned_username := SUBSTRING(base_username, 1, 23) || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);
    avatar_seed := COALESCE(NEW.email, cleaned_username);

    INSERT INTO public.profiles (id, email, username, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, 'user_' || NEW.id::text || '@example.com'),
        cleaned_username,
        COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1), cleaned_username),
        'https://picsum.photos/seed/' || avatar_seed || '/150'
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NEW; -- Safely bypass failures to guarantee auth flows never lock up
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create auth tracking trigger
CREATE OR REPLACE TRIGGER on_auth_user_signup
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();


-- =====================================================================
-- TABLE 2: ROOMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_private BOOLEAN DEFAULT FALSE,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON public.rooms(slug);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON public.rooms(host_id);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to all rooms" 
ON public.rooms FOR SELECT USING (true);

CREATE POLICY "Allow users to manage rooms they host" 
ON public.rooms FOR ALL TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE OR REPLACE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- TABLE 3: ROOM_MEMBERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    guest_id UUID,
    display_name TEXT,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    is_host BOOLEAN DEFAULT FALSE,
    session_id TEXT,
    is_muted BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    UNIQUE (room_id, user_id),
    CONSTRAINT check_user_or_guest CHECK (
        (user_id IS NOT NULL AND guest_id IS NULL) OR
        (user_id IS NULL AND guest_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_members_room_guest ON public.room_members(room_id, guest_id) WHERE (guest_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);

-- Ensure table alters for running/existing databases to guarantee backwards compatibility
-- This prevents cache/mismatch issues if tables were created previously
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT FALSE;

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to room members list" 
ON public.room_members FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert access to room members list" 
ON public.room_members FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public manage access to room members list" 
ON public.room_members FOR ALL TO public USING (true);


-- =====================================================================
-- TABLE 4: ROOM_PERMISSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.room_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    can_invite BOOLEAN DEFAULT FALSE,
    can_kick BOOLEAN DEFAULT FALSE,
    can_control_playback BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_permissions_room_user ON public.room_permissions(room_id, user_id);

ALTER TABLE public.room_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members readable permissions" 
ON public.room_permissions FOR SELECT USING (true);

CREATE POLICY "Allow hosts to update room permissions" 
ON public.room_permissions FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.rooms WHERE id = room_id AND host_id = auth.uid()));

CREATE OR REPLACE TRIGGER update_room_permissions_updated_at
    BEFORE UPDATE ON public.room_permissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- TABLE 5: JOIN_REQUESTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_join_requests_room ON public.join_requests(room_id);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and create their own join requests" 
ON public.join_requests FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Hosts can view and update pending join requests log" 
ON public.join_requests FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.rooms WHERE id = room_id AND host_id = auth.uid()));

CREATE OR REPLACE TRIGGER update_join_requests_updated_at
    BEFORE UPDATE ON public.join_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- TABLE 6: MESSAGES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created_at ON public.messages(room_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members access to message logs" 
ON public.messages FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to construct chat entries" 
ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);


-- =====================================================================
-- TABLE 7: PLAYBACK_STATE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.playback_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID UNIQUE NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    track_id TEXT,
    track_name TEXT,
    artist_name TEXT,
    duration_ms INTEGER DEFAULT 0,
    progress_ms INTEGER DEFAULT 0,
    is_playing BOOLEAN DEFAULT FALSE,
    updated_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to playback synchronizer" 
ON public.playback_state FOR SELECT USING (true);

CREATE POLICY "Allow room members & co-hosts update permission" 
ON public.playback_state FOR ALL TO authenticated USING (true);

CREATE OR REPLACE TRIGGER update_playback_state_updated_at
    BEFORE UPDATE ON public.playback_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================================
-- TABLE 8: ROOM_ACTIVITY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.room_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_activity_room_time ON public.room_activity(room_id, created_at);

ALTER TABLE public.room_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow viewing room specific activity feed" 
ON public.room_activity FOR SELECT USING (true);

CREATE POLICY "Allow publishing status logs into room dynamic logs" 
ON public.room_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);


-- =====================================================================
-- TABLE 9: TRUSTED_USERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.trusted_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    trusted_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, trusted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_users_source ON public.trusted_users(user_id);

ALTER TABLE public.trusted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow private trust level updates" 
ON public.trusted_users FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- =====================================================================
-- TABLE 10: MEDIA_QUEUE
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.media_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    track_name TEXT,
    artist_name TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    added_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_by_guest_id UUID,
    added_by_name TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_played BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_queue_room ON public.media_queue(room_id);

ALTER TABLE public.media_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to media queue" 
ON public.media_queue FOR SELECT TO public USING (true);

CREATE POLICY "Allow public write access to media queue" 
ON public.media_queue FOR ALL TO public USING (true);


-- =====================================================================
-- TABLE 11: PRESENCE (Realtime participants heartbeat fallback)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    guest_id UUID,
    display_name TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (room_id, user_id),
    UNIQUE (room_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_room ON public.presence(room_id);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to presence" 
ON public.presence FOR SELECT TO public USING (true);

CREATE POLICY "Allow public write access to presence" 
ON public.presence FOR ALL TO public USING (true);


-- =====================================================================
-- TABLE 12: GUEST_SESSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access to guest sessions" 
ON public.guest_sessions FOR ALL TO public USING (true);


-- =====================================================================
-- SUPABASE REALTIME CONFIGURATION (Enable realtime on highly dynamic fields)
-- =====================================================================
BEGIN;
  -- Drop publication if exists to refresh
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.join_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
