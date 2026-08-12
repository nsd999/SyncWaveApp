export interface PlaybackState {
  id?: string;
  room_id: string;
  media_url: string | null;
  media_type: string | null;
  is_playing: boolean;
  current_time: number;
  duration: number;
  playback_rate: number;
  updated_by?: string | null;
  last_sync_at: string;
  created_at?: string;
  updated_at?: string;
}

export type RoomPlaybackEvent = 'play' | 'pause' | 'seek' | 'media_change' | 'sync_request' | 'rate_change';

export interface PlaybackSyncPayload {
  event: RoomPlaybackEvent;
  state: Partial<PlaybackState>;
  client_timestamp: number;
}

export interface HostControlEvent {
  event: RoomPlaybackEvent;
  room_id: string;
  media_url?: string;
  current_time?: number;
  is_playing?: boolean;
}

export interface MediaQueueItem {
  id: string;
  room_id: string;
  media_url: string;
  media_type: 'video' | 'audio' | 'youtube';
  title: string | null;
  thumbnail_url: string | null;
  duration: number;
  added_by: string | null;
  added_by_name: string | null;
  position: number;
  is_played: boolean;
  created_at: string;
}
