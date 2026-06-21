import { getSupabase } from './supabase';
import { PlaybackState } from '@/types/playback';
import { writeLog } from './logger';

export class PlaybackSyncService {
  /**
   * Initializes or fetches the playback state for a given room.
   * If it doesn't exist, creates a default one.
   */
  static async initializePlaybackState(roomId: string, isHost: boolean): Promise<PlaybackState | null> {
    const supabase = getSupabase() as any;
    if (!supabase) return null;

    try {
      // Fetch current state
      const { data, error } = await supabase
        .from('playback_state')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        return data as PlaybackState;
      }

      // If it doesn't exist and we are the host, initialize it gracefully.
      if (isHost) {
        writeLog('info', 'Sync Wave Engine', `Initializing default playback state record for room: ${roomId}`);
        const defaultState = {
          room_id: roomId,
          media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          media_type: 'video',
          is_playing: false,
          current_time: 0,
          duration: 596, // Approximate duration of BigBuckBunny.mp4 (596 seconds)
          playback_rate: 1,
          last_sync_at: new Date().toISOString()
        };

        const { data: newRow, error: insertError } = await supabase
          .from('playback_state')
          .insert(defaultState as any)
          .select()
          .single();

        if (insertError) {
          // If insert fails due to race conditions (another client inserted it first), fetch it again
          console.warn('[Playback Engine] Insert race condition, retrying fetch:', insertError.message);
          const { data: retryData } = await supabase
            .from('playback_state')
            .select('*')
            .eq('room_id', roomId)
            .maybeSingle();
          if (retryData) return retryData as PlaybackState;
          throw insertError;
        }

        return newRow as PlaybackState;
      }

      return null;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to initialize playback state:', e.message);
      writeLog('error', 'Sync Wave Engine', `Failed to initialize room playback: ${e.message}`);
      return null;
    }
  }

  /**
   * Updates is_playing to true, and sets the current position synchronized across all clients.
   */
  static async play(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('playback_state')
        .update({
          is_playing: true,
          current_time: currentTime,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: updatedByUserId || null
        } as any)
        .eq('room_id', roomId);

      if (error) throw error;
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PLAY event from timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] play update error:', e.message);
    }
  }

  /**
   * Updates is_playing to false, and specifies the timestamp.
   */
  static async pause(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('playback_state')
        .update({
          is_playing: false,
          current_time: currentTime,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: updatedByUserId || null
        } as any)
        .eq('room_id', roomId);

      if (error) throw error;
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PAUSE event at timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] pause update error:', e.message);
    }
  }

  /**
   * Synchronises the media player to a new position.
   */
  static async seek(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('playback_state')
        .update({
          current_time: currentTime,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: updatedByUserId || null
        } as any)
        .eq('room_id', roomId);

      if (error) throw error;
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SEEK event to: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] seek update error:', e.message);
    }
  }

  /**
   * Changes the media URL loaded in the player.
   */
  static async updateMedia(
    roomId: string, 
    mediaUrl: string, 
    mediaType: 'video' | 'audio', 
    duration: number,
    updatedByUserId?: string
  ): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('playback_state')
        .update({
          media_url: mediaUrl,
          media_type: mediaType,
          current_time: 0,
          duration: duration,
          is_playing: false,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: updatedByUserId || null
        } as any)
        .eq('room_id', roomId);

      if (error) throw error;
      writeLog('success', 'Sync Wave Engine', `Host changed media file: ${mediaUrl}`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateMedia error:', e.message);
    }
  }

  /**
   * Subscribes to database real-time broadcasts for the room.
   */
  static subscribeToPlayback(
    roomId: string, 
    onUpdate: (state: PlaybackState) => void
  ) {
    const supabase = getSupabase() as any;
    if (!supabase) return null;

    const channelName = `syncwave-playback-room-${roomId}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playback_state', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          if (payload.new) {
            onUpdate(payload.new as PlaybackState);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[PlaybackSyncService] Connected to playback synchronization channel.');
        }
      });

    return channel;
  }
}
