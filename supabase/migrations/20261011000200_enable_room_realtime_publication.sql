-- Ensure the room collaboration tables publish row changes to Supabase Realtime.
-- Safe to rerun: only tables missing from the publication are added.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase publication supabase_realtime does not exist';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'rooms',
    'room_members',
    'messages',
    'playback_state',
    'media_queue'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = table_name
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
