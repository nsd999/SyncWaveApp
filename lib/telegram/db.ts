import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';

export function normalizeRoomSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

export async function findRoomBySlug(slug: string): Promise<any> {
  const normalized = normalizeRoomSlug(slug);
  const q = query(collection(db, 'rooms'), where('slug', '==', normalized));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function getRoomMembers(roomId: string): Promise<any[]> {
  const q = query(
    collection(db, 'room_members'),
    where('room_id', '==', roomId),
    where('is_banned', '==', false)
  );
  const snap = await getDocs(q);
  const members: any[] = [];
  snap.forEach((d) => members.push({ id: d.id, ...d.data() }));
  return members;
}

export async function getPlaybackState(roomId: string): Promise<any> {
  const snap = await getDoc(doc(db, 'playback_state', roomId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updatePlaybackState(roomId: string, updates: any): Promise<any> {
  const docRef = doc(db, 'playback_state', roomId);
  const snap = await getDoc(docRef);

  const payload = {
    ...updates,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (snap.exists()) {
    await updateDoc(docRef, payload);
  } else {
    await setDoc(docRef, { room_id: roomId, ...payload });
  }

  const updatedSnap = await getDoc(docRef);
  return { id: updatedSnap.id, ...updatedSnap.data() };
}

export async function getRoomQueue(roomId: string): Promise<any[]> {
  const q = query(
    collection(db, 'media_queue'),
    where('room_id', '==', roomId),
    where('is_played', '==', false),
    orderBy('position', 'asc')
  );
  const snap = await getDocs(q);
  const items: any[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  return items;
}

export async function addMediaToQueue(
  roomId: string,
  mediaUrl: string,
  title: string,
  addedByName: string,
  addedByProfileId?: string
): Promise<any> {
  const currentQueue = await getRoomQueue(roomId);
  const nextPosition = currentQueue.length > 0
    ? Math.max(...currentQueue.map((item: any) => item.position || 0)) + 1
    : 0;

  const mediaType = (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) ? 'video' : 'audio';

  const itemData = {
    room_id: roomId,
    media_url: mediaUrl,
    media_type: mediaType,
    title: title || 'Media Track',
    added_by: addedByProfileId || null,
    added_by_name: addedByName || 'Telegram User',
    position: nextPosition,
    is_played: false
  };

  const docRef = await addDoc(collection(db, 'media_queue'), itemData);

  if (currentQueue.length === 0) {
    await updatePlaybackState(roomId, {
      media_url: mediaUrl,
      media_type: mediaType,
      is_playing: true,
      current_time: 0,
      duration: 0
    });
  }

  return { id: docRef.id, ...itemData };
}

export async function skipTrack(roomId: string): Promise<any> {
  const currentQueue = await getRoomQueue(roomId);

  if (currentQueue.length === 0) {
    return await updatePlaybackState(roomId, {
      media_url: null,
      media_type: null,
      is_playing: false,
      current_time: 0,
      duration: 0
    });
  }

  const currentTrack = currentQueue[0];
  await updateDoc(doc(db, 'media_queue', currentTrack.id), { is_played: true });

  const remainingQueue = currentQueue.slice(1);
  if (remainingQueue.length > 0) {
    const nextTrack = remainingQueue[0];
    return await updatePlaybackState(roomId, {
      media_url: nextTrack.media_url,
      media_type: nextTrack.media_type,
      is_playing: true,
      current_time: 0,
      duration: nextTrack.duration || 0
    });
  } else {
    return await updatePlaybackState(roomId, {
      media_url: null,
      media_type: null,
      is_playing: false,
      current_time: 0,
      duration: 0
    });
  }
}

export async function upsertTelegramUser(tgUser: {
  telegram_user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  linked_profile_id?: string;
}): Promise<any> {
  const docRef = doc(db, 'telegram_users', String(tgUser.telegram_user_id));
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    const existing = snap.data();
    const updates: any = {
      username: tgUser.username ?? existing.username,
      first_name: tgUser.first_name ?? existing.first_name,
      last_name: tgUser.last_name ?? existing.last_name,
      updated_at: new Date().toISOString()
    };
    if (tgUser.linked_profile_id) {
      updates.linked_profile_id = tgUser.linked_profile_id;
    }
    await updateDoc(docRef, updates);
    const updatedSnap = await getDoc(docRef);
    return { id: updatedSnap.id, ...updatedSnap.data() };
  } else {
    const payload = {
      telegram_user_id: tgUser.telegram_user_id,
      username: tgUser.username || null,
      first_name: tgUser.first_name || null,
      last_name: tgUser.last_name || null,
      linked_profile_id: tgUser.linked_profile_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await setDoc(docRef, payload);
    return { id: docRef.id, ...payload };
  }
}

export async function getLinkedRoom(chatId: number): Promise<any> {
  const q = query(collection(db, 'telegram_room_links'), where('telegram_chat_id', '==', chatId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function linkChatToRoom(chatId: number, roomId: string, linkedByTgId: number): Promise<any> {
  const q = query(collection(db, 'telegram_room_links'), where('telegram_chat_id', '==', chatId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const docRef = doc(db, 'telegram_room_links', snap.docs[0].id);
    await updateDoc(docRef, {
      room_id: roomId,
      linked_by: linkedByTgId,
    });
    const updatedSnap = await getDoc(docRef);
    return { id: updatedSnap.id, ...updatedSnap.data() };
  } else {
    const payload = {
      room_id: roomId,
      telegram_chat_id: chatId,
      linked_by: linkedByTgId,
      created_at: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'telegram_room_links'), payload);
    return { id: docRef.id, ...payload };
  }
}

export async function logTelegramCommand(tgUserId: number, command: string, roomId: string | null, payload: any, status: string): Promise<void> {
  try {
    await addDoc(collection(db, 'telegram_command_logs'), {
      telegram_user_id: tgUserId,
      command,
      room_id: roomId,
      payload: payload ? JSON.stringify(payload) : null,
      status,
      created_at: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Error writing telegram command log:', e.message);
  }
}

export async function isUserHost(tgUserId: number, roomId: string): Promise<boolean> {
  const tgSnap = await getDoc(doc(db, 'telegram_users', String(tgUserId)));
  if (!tgSnap.exists() || !tgSnap.data().linked_profile_id) return false;

  const roomSnap = await getDoc(doc(db, 'rooms', roomId));
  if (!roomSnap.exists()) return false;

  return roomSnap.data().host_id === tgSnap.data().linked_profile_id;
}
