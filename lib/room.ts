import { supabase } from './supabase';

export interface Room {
  id: string;
  name: string;
  slug: string;
  description?: string;
  host_id: string;
  is_private: boolean;
  password_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id?: string;
  guest_id?: string;
  display_name?: string;
  session_id?: string;
  is_muted: boolean;
  is_banned: boolean;
  joined_at: string;
  profiles?: {
    display_name: string;
    username: string;
    avatar_url: string;
  };
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    const r = Math.floor(Math.random() * chars.length);
    result += chars.charAt(r);
  }
  return result;
}

export async function getUniqueGuestName(roomId: string, baseName: string): Promise<string> {
  try {
    const trimmed = baseName.trim();
    
    const { data, error } = await supabase
      .from('room_members')
      .select('display_name, profiles(display_name)')
      .eq('room_id', roomId);
      
    if (error) throw error;

    const existingNames = new Set<string>();
    
    if (data) {
      data.forEach((member: any) => {
        const name = member.profiles?.display_name || member.display_name;
        if (name) {
          existingNames.add(name.toLowerCase());
        }
      });
    }

    if (!existingNames.has(trimmed.toLowerCase())) {
      return trimmed;
    }

    let index = 1;
    while (existingNames.has(`${trimmed.toLowerCase()}-${index}`)) {
      index++;
    }

    return `${trimmed}-${index}`;
  } catch (err: any) {
    console.error('[Room Engine] Handshake collision exception:', err);
    return baseName;
  }
}
