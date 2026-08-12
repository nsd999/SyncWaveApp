import { supabase } from '../supabase';

export function normalizeRoomSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

export async function findRoomBySlug(slug: string): Promise<any> {
  const normalized = normalizeRoomSlug(slug);
  const { data, error } = await supabase.from('rooms').select('*').eq('slug', normalized).single();
  if (error || !data) return null;
  return data;
}

export async function getRoomMembers(roomId: string): Promise<any[]> {
  const { data, error } = await supabase.from('room_members').select('*').eq('room_id', roomId).eq('is_banned', false);
  if (error) return [];
  return data;
}

export async function getPlaybackState(roomId: string): Promise<any> {
  const { data, error } = await supabase.from('playback_state').select('*').eq('room_id', roomId).single();
  if (error || !data) return null;
  return data;
}

export async function updatePlaybackState(roomId: string, updates: any): Promise<any> {
  const payload = {
    ...updates,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from('playback_state').select('*').eq('room_id', roomId).single();
  if (existing) {
    const { data, error } = await supabase.from('playback_state').update(payload).eq('room_id', roomId).select().single();
    if (error) throw error;
    return data;
  } else {
    const insertPayload = { room_id: roomId, ...payload };
    const { data, error } = await supabase.from('playback_state').insert([insertPayload]).select().single();
    if (error) throw error;
    return data;
  }
}

export async function getRoomQueue(roomId: string): Promise<any[]> {
  const { data, error } = await supabase.from('media_queue').select('*').eq('room_id', roomId).eq('is_played', false).order('position', { ascending: true });
  if (error) return [];
  return data;
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

  const { data: inserted, error } = await supabase.from('media_queue').insert([itemData]).select().single();
  if (error) throw error;

  if (currentQueue.length === 0) {
    await updatePlaybackState(roomId, {
      media_url: mediaUrl,
      media_type: mediaType,
      is_playing: true,
      current_time: 0,
      duration: 0
    });
  }

  return inserted;
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
  await supabase.from('media_queue').update({ is_played: true }).eq('id', currentTrack.id);

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
  const { data: existing } = await supabase.from('telegram_users').select('*').eq('telegram_user_id', tgUser.telegram_user_id).single();

  if (existing) {
    const updates: any = {
      username: tgUser.username ?? existing.username,
      first_name: tgUser.first_name ?? existing.first_name,
      last_name: tgUser.last_name ?? existing.last_name,
      updated_at: new Date().toISOString()
    };
    if (tgUser.linked_profile_id) {
      updates.linked_profile_id = tgUser.linked_profile_id;
    }
    const { data: updated, error } = await supabase.from('telegram_users').update(updates).eq('telegram_user_id', tgUser.telegram_user_id).select().single();
    if (error) throw error;
    return updated;
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
    const { data: inserted, error } = await supabase.from('telegram_users').insert([payload]).select().single();
    if (error) throw error;
    return inserted;
  }
}

export async function getLinkedRoom(chatId: number): Promise<any> {
  const { data, error } = await supabase.from('telegram_room_links').select('*').eq('telegram_chat_id', chatId).single();
  if (error || !data) return null;
  return data;
}

export async function linkChatToRoom(chatId: number, roomId: string, linkedByTgId: number): Promise<any> {
  const { data: existing } = await supabase.from('telegram_room_links').select('*').eq('telegram_chat_id', chatId).single();

  if (existing) {
    const { data: updated, error } = await supabase.from('telegram_room_links').update({
      room_id: roomId,
      linked_by: linkedByTgId,
    }).eq('id', existing.id).select().single();
    if (error) throw error;
    return updated;
  } else {
    const payload = {
      room_id: roomId,
      telegram_chat_id: chatId,
      linked_by: linkedByTgId,
      created_at: new Date().toISOString()
    };
    const { data: inserted, error } = await supabase.from('telegram_room_links').insert([payload]).select().single();
    if (error) throw error;
    return inserted;
  }
}

export async function logTelegramCommand(tgUserId: number, command: string, roomId: string | null, payload: any, status: string): Promise<void> {
  try {
    await supabase.from('telegram_command_logs').insert([{
      telegram_user_id: tgUserId,
      command,
      room_id: roomId,
      payload: payload ? JSON.stringify(payload) : null,
      status,
      created_at: new Date().toISOString()
    }]);
  } catch (e: any) {
    console.error('Error writing telegram command log:', e.message);
  }
}

export async function isUserHost(tgUserId: number, roomId: string): Promise<boolean> {
  const { data: tgUser, error: tgError } = await supabase.from('telegram_users').select('linked_profile_id').eq('telegram_user_id', tgUserId).single();
  if (tgError || !tgUser || !tgUser.linked_profile_id) return false;

  const { data: room, error: roomError } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
  if (roomError || !room) return false;

  return room.host_id === tgUser.linked_profile_id;
}
