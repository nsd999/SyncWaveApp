import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  deleteDoc,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { PlaybackState, MediaQueueItem } from '@/types/playback';
import { writeLog } from './logger';

export class PlaybackSyncService {
  static async initializePlaybackState(roomId: string, isHost: boolean): Promise<PlaybackState | null> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        return snap.data() as PlaybackState;
      }

      if (isHost) {
        writeLog('info', 'Sync Wave Engine', `Initializing default playback state record for room: ${roomId}`);
        const defaultState: PlaybackState = {
          room_id: roomId,
          media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          media_type: 'video',
          is_playing: false,
          current_time: 0,
          duration: 596,
          playback_rate: 1,
          last_sync_at: new Date().toISOString()
        };

        await setDoc(docRef, defaultState);
        return defaultState;
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
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        is_playing: true,
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      });
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PLAY event from timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] play update error:', e.message);
    }
  }

  static async pause(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        is_playing: false,
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      });
      writeLog('success', 'Sync Wave Engine', `Host broadcasted PAUSE event at timestamp: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] pause update error:', e.message);
    }
  }

  static async seek(roomId: string, currentTime: number, updatedByUserId?: string): Promise<void> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        current_time: currentTime,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      });
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SEEK event to: ${currentTime.toFixed(1)}s`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] seek update error:', e.message);
    }
  }

  static async updateTime(
    roomId: string, 
    currentTime: number, 
    duration: number, 
    updatedByUserId?: string
  ): Promise<void> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        current_time: currentTime,
        duration: duration,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateTime error:', e.message);
    }
  }

  static async updateRate(roomId: string, playbackRate: number, updatedByUserId?: string): Promise<void> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        playback_rate: playbackRate,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      });
      writeLog('success', 'Sync Wave Engine', `Host broadcasted SPEED event: ${playbackRate}x`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateRate error:', e.message);
    }
  }

  static async updateMedia(
    roomId: string, 
    mediaUrl: string, 
    mediaType: 'video' | 'audio', 
    duration: number,
    updatedByUserId?: string
  ): Promise<void> {
    try {
      const docRef = doc(db, 'playback_state', roomId);
      await updateDoc(docRef, {
        media_url: mediaUrl,
        media_type: mediaType,
        current_time: 0,
        duration: duration,
        is_playing: false,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: updatedByUserId || null
      });
      writeLog('success', 'Sync Wave Engine', `Host changed media file: ${mediaUrl}`);
    } catch (e: any) {
      console.error('[PlaybackSyncService] updateMedia error:', e.message);
    }
  }

  static subscribeToPlayback(
    roomId: string, 
    onUpdate: (state: PlaybackState) => void
  ) {
    const docRef = doc(db, 'playback_state', roomId);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as PlaybackState);
      }
    });
  }

  static async fetchQueue(roomId: string): Promise<MediaQueueItem[]> {
    try {
      const q = query(
        collection(db, 'media_queue'),
        where('room_id', '==', roomId),
        where('is_played', '==', false),
        orderBy('position', 'asc')
      );
      const snap = await getDocs(q);
      const items: MediaQueueItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as MediaQueueItem));
      return items;
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
      const q = query(
        collection(db, 'media_queue'),
        where('room_id', '==', roomId),
        where('is_played', '==', false),
        orderBy('position', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      let nextPos = 0;
      snap.forEach((d) => {
        nextPos = (d.data().position || 0) + 1;
      });

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

      const docRef = await addDoc(collection(db, 'media_queue'), itemData);
      writeLog('success', 'Media Queue', `Added item to playlist: "${title}" at index ${nextPos}`);
      return { id: docRef.id, ...itemData } as MediaQueueItem;
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to add to media queue:', e.message);
      return null;
    }
  }

  static async removeFromQueue(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'media_queue', id));
      writeLog('success', 'Media Queue', 'Removed item from queue');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to remove from media queue:', e.message);
    }
  }

  static async reorderQueue(items: { id: string; position: number }[]): Promise<void> {
    try {
      for (const item of items) {
        await updateDoc(doc(db, 'media_queue', item.id), { position: item.position });
      }
      writeLog('success', 'Media Queue', 'Playlist reordered successfully');
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to reorder media queue:', e.message);
    }
  }

  static async markAsPlayed(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'media_queue', id), { is_played: true });
    } catch (e: any) {
      console.error('[PlaybackSyncService] Failed to set is_played state:', e.message);
    }
  }
}
