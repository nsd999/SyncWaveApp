import { getSupabase } from './supabase';
import { PlaybackState, MediaQueueItem } from '@/types/playback';
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
   * Updates only current_time in playback_state without raising heavy seek flags.
   */
  static async updateTime(
    roomId: string, 
    currentTime: number, 
    duration: number, 
    updatedByUserId?: string
  ): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      await supabase
        .from('playback_state')
        .update({
          current_time: currentTime,
          duration: duration,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any)
        .eq('room_id', roomId);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateTime error:', e.message);
    }
  }

  /**
   * Updates playback_rate for synchronous playback speed adjustment.
   */
  static async updateRate(roomId: string, playbackRate: number, updatedByUserId?: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('playback_state')
        .update({
          playback_rate: playbackRate,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: updatedByUserId || null
        } as any)
        .eq('room_id', roomId);

      if (error) throw error;
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SPEED event: ${playbackRate}x`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateRate error:', e.message);
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

  /**
   * Fetches the room's current media queue.
   */
  static async fetchQueue(roomId: string): Promise<MediaQueueItem[]> {
    const supabase = getSupabase() as any;
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('media_queue')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_played', false)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data || []) as MediaQueueItem[];
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to fetch media queue:', e.message);
      return [];
    }
  }

  /**
   * Appends an item to the media queue.
   */
  static async addToQueue(
    roomId: string,
    mediaUrl: string,
    mediaType: 'video' | 'audio' | 'youtube',
    title: string,
    duration: number,
    thumbnailUrl?: string,
    addedBy?: string,
    addedByName?: string
  ): Promise<MediaQueueItem | null> {
    const supabase = getSupabase() as any;
    if (!supabase) return null;

    try {
      // Find current max position to append to the end
      const { data: existing, error: fetchErr } = await supabase
        .from('media_queue')
        .select('position')
        .eq('room_id', roomId)
        .eq('is_played', false)
        .order('position', { ascending: false })
        .limit(1);

      if (fetchErr) throw fetchErr;

      const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0;

      const itemData = {
        room_id: roomId,
        media_url: mediaUrl,
        media_type: mediaType,
        title: title || 'Untitled Stream',
        thumbnail_url: thumbnailUrl || `https://picsum.photos/seed/${encodeURIComponent(mediaUrl)}/120/90`,
        duration: duration || 0,
        added_by: addedBy ? addedBy : null,
        added_by_name: addedByName || 'Host',
        position: nextPos,
        is_played: false
      };

      const { data, error } = await supabase
        .from('media_queue')
        .insert(itemData as any)
        .select()
        .single();

      if (error) throw error;

      writeLog('success', 'Media Queue', `Added item to playlist: "${title}" at index ${nextPos}`);
      return data as MediaQueueItem;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to add to media queue:', e.message);
      return null;
    }
  }

  /**
   * Removes an item from the media queue.
   */
  static async removeFromQueue(id: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('media_queue')
        .delete()
        .eq('id', id);

      if (error) throw error;
      writeLog('success', 'Media Queue', 'Removed item from queue');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to remove from media queue:', e.message);
    }
  }

  /**
   * Updates coordinates/positions of media items.
   */
  static async reorderQueue(items: { id: string; position: number }[]): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      // Save items sequentially
      for (const item of items) {
        await supabase
          .from('media_queue')
          .update({ position: item.position })
          .eq('id', item.id);
      }
      writeLog('success', 'Media Queue', 'Playlist reordered successfully');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to reorder media queue:', e.message);
    }
  }

  /**
   * Marks a queue item as having been played / finished.
   */
  static async markAsPlayed(id: string): Promise<void> {
    const supabase = getSupabase() as any;
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('media_queue')
        .update({ is_played: true })
        .eq('id', id);

      if (error) throw error;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to set is_played state:', e.message);
    }
  }
}

