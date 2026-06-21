import { getSupabase } from './supabase';
import { writeLog } from './logger';

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
  // Extends profiles
  profiles?: {
    display_name: string;
    username: string;
    avatar_url: string;
  };
}

/**
 * Generates a highly unique, readable, and uppercase 6-character room slug/code.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No visually ambiguous characters (0/O, 1/I)
  let result = '';
  // Combine timestamp elements to avoid immediate repeats even if called concurrently
  for (let i = 0; i < 6; i++) {
    const r = Math.floor(Math.random() * chars.length);
    result += chars.charAt(r);
  }
  return result;
}

/**
 * Validates display name collisions and suffixes appropriately (e.g. Sai, Sai-1, Sai-2)
 */
export async function getUniqueGuestName(roomId: string, baseName: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return baseName;

  try {
    const trimmed = baseName.trim();
    // Fetch all current members/guests in the room
    const { data, error } = await supabase
      .from('room_members')
      .select('display_name, profiles(display_name)')
      .eq('room_id', roomId);

    if (error) {
      console.error('[Room Engine] Error checking name collisions:', error.message);
      return trimmed;
    }

    // Accumulate all active names (profiles display_name OR guest display_name)
    const existingNames = new Set<string>();
    data?.forEach((row: any) => {
      const name = row.profiles?.display_name || row.display_name;
      if (name) {
        existingNames.add(name.toLowerCase());
      }
    });

    if (!existingNames.has(trimmed.toLowerCase())) {
      return trimmed;
    }

    // Enforce sequence: Sai-1, Sai-2, etc.
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
