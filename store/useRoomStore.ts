import { create } from 'zustand';
import type { User } from 'firebase/auth';

export interface RoomMember {
  id: string;
  display_name: string;
  is_host: boolean;
  status: 'active' | 'inactive';
  joined_at: number;
  last_active: number;
  is_banned?: boolean;
  is_muted?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender_id: string;
  sender_name: string;
  created_at: number;
  is_system?: boolean;
}

export interface PlaybackState {
  video_id: string;
  is_playing: boolean;
  current_time: number;
  updated_at: number;
  updated_by: string;
}

export interface RoomState {
  roomCode: string | null;
  roomMetadata: any | null;
  firebaseConnected: boolean;
  user: User | null;
  currentMember: RoomMember | null;
  members: RoomMember[];
  messages: ChatMessage[];
  playbackState: PlaybackState | null;
  mediaQueue: string[];
  isTyping: boolean;
  
  // Actions
  setRoomCode: (code: string) => void;
  setRoomMetadata: (data: any) => void;
  setFirebaseConnected: (connected: boolean) => void;
  setUser: (user: User | null) => void;
  setCurrentMember: (member: RoomMember | null) => void;
  setMembers: (members: RoomMember[]) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setMediaQueue: (queue: string[]) => void;
  setIsTyping: (typing: boolean) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: null,
  roomMetadata: null,
  firebaseConnected: false,
  user: null,
  currentMember: null,
  members: [],
  messages: [],
  playbackState: null,
  mediaQueue: [],
  isTyping: false,

  setRoomCode: (code) => set({ roomCode: code }),
  setRoomMetadata: (data) => set({ roomMetadata: data }),
  setFirebaseConnected: (connected) => set({ firebaseConnected: connected }),
  setUser: (user) => set({ user }),
  setCurrentMember: (member) => set({ currentMember: member }),
  setMembers: (members) => set({ members }),
  setMessages: (messages) => set({ messages }),
  setPlaybackState: (state) => set({ playbackState: state }),
  setMediaQueue: (queue) => set({ mediaQueue: queue }),
  setIsTyping: (typing) => set({ isTyping: typing }),
}));
