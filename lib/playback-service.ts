import { supabase } from './supabase';
import { PlaybackState, MediaQueueItem } from '@/types/playback';
import { writeLog } from './logger';

export class PlaybackSyncService {
  static async initializePlaybackState(roomId: string, isHost: boolean): Promise<PlaybackState | null> {
    try {
      const { data, error } = await supabase
        .from('playback_state')
        .select('*')
        .eq('room_id', roomId)
        .single();

      if (data) {
        return data as PlaybackState;
      }

      if (isHost) {
        writeLog('info', 'Sync Wave Engine', `Initializing default playback state record for room: ${roomId}`);
        const defaultState = {
          room_id: roomId,
          media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          media_type: 'video',
          is_playing: false,
          current_time: 0,
          duration: 596,
          playback_rate: 1,
          last_sync_at: new Date().toISOString()
        };

        const { data: inserted, error: insertError } = await supabase
          .from('playback_state')
          .insert([defaultState])
          .select()
          .single();

        if (insertError) throw insertError;
        return inserted as PlaybackState;
      }

      return null;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to initialize playback state:', e.message);
      writeLog('error', 'Sync Wave Engine', `Failed to initialize room playback: ${e.message}`);
      return null;
    }
  }

  static async play(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        is_playing: true,
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      }).eq('room_id', roomId);
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PLAY event from timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] play update error:', e.message);
    }
  }

  static async pause(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        is_playing: false,
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      }).eq('room_id', roomId);
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PAUSE event at timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] pause update error:', e.message);
    }
  }

  static async seek(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      }).eq('room_id', roomId);
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SEEK event to: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] seek update error:', e.message);
    }
  }

  static async updateTime(roomId: string, currentTime: number, duration: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        current_time: currentTime,
        duration: duration,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('room_id', roomId);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateTime error:', e.message);
    }
  }

  static async updateRate(roomId: string, playbackRate: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        playback_rate: playbackRate,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      }).eq('room_id', roomId);
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SPEED event: ${playbackRate}x`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateRate error:', e.message);
    }
  }

  static async updateMedia(roomId: string, mediaUrl: string, mediaType: 'video' | 'audio', duration: number, updatedByUserId?: string): Promise<void> {
    try {
      await supabase.from('playback_state').update({
        media_url: mediaUrl,
        media_type: mediaType,
        current_time: 0,
        duration: duration,
        is_playing: false,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      }).eq('room_id', roomId);
      writeLog('success', 'Sync Wave Engine', `Host changed media file: ${mediaUrl}`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateMedia error:', e.message);
    }
  }

  static subscribeToPlayback(roomId: string, onUpdate: (state: PlaybackState) => void) {
    const channel = supabase.channel(`public:playback_state:room_id=eq.${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playback_state', filter: `room_id=eq.${roomId}` }, (payload) => {
        onUpdate(payload.new as PlaybackState);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  static async fetchQueue(roomId: string): Promise<MediaQueueItem[]> {
    try {
      const { data, error } = await supabase
        .from('media_queue')
        .select('*')
        .eq('room_id', roomId)
        .eq('is_played', false)
        .order('position', { ascending: true });
        
      if (error) throw error;
      return data as MediaQueueItem[];
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to fetch media queue:', e.message);
      return [];
    }
  }

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
    try {
      const { data: latestQueue, error: queueError } = await supabase
        .from('media_queue')
        .select('position')
        .eq('room_id', roomId)
        .eq('is_played', false)
        .order('position', { ascending: false })
        .limit(1);

      if (queueError) throw queueError;
      
      let nextPos = 0;
      if (latestQueue && latestQueue.length > 0) {
        nextPos = (latestQueue[0].position || 0) + 1;
      }

      const itemData = {
        room_id: roomId,
        media_url: mediaUrl,
        media_type: mediaType,
        title: title || 'Untitled Stream',
        thumbnail_url: thumbnailUrl || `https://picsum.photos/seed/${encodeURIComponent(mediaUrl)}/120/90`,
        duration: duration || 0,
        added_by: addedBy || null,
        added_by_name: addedByName || 'Host',
        position: nextPos,
        is_played: false
      };

      const { data, error } = await supabase
        .from('media_queue')
        .insert([itemData])
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

  static async removeFromQueue(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('media_queue').delete().eq('id', id);
      if (error) throw error;
      writeLog('success', 'Media Queue', 'Removed item from queue');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to remove from media queue:', e.message);
    }
  }

  static async reorderQueue(items: { id: string; position: number }[]): Promise<void> {
    try {
      for (const item of items) {
        await supabase.from('media_queue').update({ position: item.position }).eq('id', item.id);
      }
      writeLog('success', 'Media Queue', 'Playlist reordered successfully');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to reorder media queue:', e.message);
    }
  }

  static async markAsPlayed(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('media_queue').update({ is_played: true }).eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to set is_played state:', e.message);
    }
  }
}
