import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

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
    const q = query(collection(db, 'room_members'), where('room_id', '==', roomId));
    const snap = await getDocs(q);

    const existingNames = new Set<string>();
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const name = data.profiles?.display_name || data.display_name;
      if (name) {
        existingNames.add(name.toLowerCase());
      }
    });

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
