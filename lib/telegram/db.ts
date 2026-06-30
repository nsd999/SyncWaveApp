import { createClient } from '@supabase/supabase-js';

// Get a server-privileged or standard Supabase client for backend operations
export function getTelegramSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role if available for admin operations, fallback to anon key
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing in server environment');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Normalizes room slug (code) as required.
 */
export function normalizeRoomSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

/**
 * Finds a room by its slug.
 */
export async function findRoomBySlug(slug: string) {
  const supabase = getTelegramSupabase();
  const normalized = normalizeRoomSlug(slug);

  const { data, error } = await supabase
    .from('rooms')
    .select('*, host:profiles(*)')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) {
    console.error('Error finding room by slug:', error);
    return null;
  }
  return data;
}

/**
 * Gets the list of members in a room.
 */
export async function getRoomMembers(roomId: string) {
  const supabase = getTelegramSupabase();
  const { data, error } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_banned', false);

  if (error) {
    console.error('Error getting room members:', error);
    return [];
  }
  return data || [];
}

/**
 * Gets current playback state for a room.
 */
export async function getPlaybackState(roomId: string) {
  const supabase = getTelegramSupabase();
  const { data, error } = await supabase
    .from('playback_state')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (error) {
    console.error('Error getting playback state:', error);
    return null;
  }
  return data;
}

/**
 * Updates playback state.
 */
export async function updatePlaybackState(roomId: string, updates: any) {
  const supabase = getTelegramSupabase();
  
  // Try to update first
  const { data, error } = await supabase
    .from('playback_state')
    .update({
      ...updates,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('room_id', roomId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating playback state:', error);
    return null;
  }

  // If no record existed, insert it
  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from('playback_state')
      .insert({
        room_id: roomId,
        ...updates,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('Error inserting playback state:', insertError);
      return null;
    }
    return inserted;
  }

  return data;
}

/**
 * Gets media queue for a room (unplayed).
 */
export async function getRoomQueue(roomId: string) {
  const supabase = getTelegramSupabase();
  const { data, error } = await supabase
    .from('media_queue')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_played', false)
    .order('position', { ascending: true });

  if (error) {
    console.error('Error getting room queue:', error);
    return [];
  }
  return data || [];
}

/**
 * Adds a media item to the queue.
 */
export async function addMediaToQueue(roomId: string, mediaUrl: string, title: string, addedByName: string, addedByProfileId?: string) {
  const supabase = getTelegramSupabase();

  // Get max position to append
  const currentQueue = await getRoomQueue(roomId);
  const nextPosition = currentQueue.length > 0 
    ? Math.max(...currentQueue.map(item => item.position || 0)) + 1 
    : 0;

  const mediaType = (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) ? 'video' : 'audio';

  const { data, error } = await supabase
    .from('media_queue')
    .insert({
      room_id: roomId,
      media_url: mediaUrl,
      media_type: mediaType,
      title: title || 'Media Track',
      added_by: addedByProfileId || null,
      added_by_name: addedByName || 'Telegram User',
      position: nextPosition,
      is_played: false
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error adding to media queue:', error);
    return null;
  }

  // If queue was empty, also set as currently playing in playback_state
  if (currentQueue.length === 0) {
    await updatePlaybackState(roomId, {
      media_url: mediaUrl,
      media_type: mediaType,
      is_playing: true,
      current_time: 0,
      duration: 0
    });
  }

  return data;
}

/**
 * Skips to next track in queue.
 */
export async function skipTrack(roomId: string) {
  const supabase = getTelegramSupabase();
  const currentQueue = await getRoomQueue(roomId);

  if (currentQueue.length === 0) {
    // No tracks to play, clear playback state URL
    return await updatePlaybackState(roomId, {
      media_url: null,
      media_type: null,
      is_playing: false,
      current_time: 0,
      duration: 0
    });
  }

  // Mark first item as played
  const currentTrack = currentQueue[0];
  await supabase
    .from('media_queue')
    .update({ is_played: true })
    .eq('id', currentTrack.id);

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

/**
 * Upserts a Telegram user in database.
 */
export async function upsertTelegramUser(tgUser: {
  telegram_user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  linked_profile_id?: string;
}) {
  const supabase = getTelegramSupabase();

  // Check if user already exists
  const { data: existing, error: findError } = await supabase
    .from('telegram_users')
    .select('*')
    .eq('telegram_user_id', tgUser.telegram_user_id)
    .maybeSingle();

  if (findError) {
    console.error('Error fetching telegram user:', findError);
  }

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

    const { data: updated, error: updateError } = await supabase
      .from('telegram_users')
      .update(updates)
      .eq('telegram_user_id', tgUser.telegram_user_id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Error updating telegram user:', updateError);
    }
    return updated || existing;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('telegram_users')
      .insert({
        telegram_user_id: tgUser.telegram_user_id,
        username: tgUser.username || null,
        first_name: tgUser.first_name || null,
        last_name: tgUser.last_name || null,
        linked_profile_id: tgUser.linked_profile_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('Error inserting telegram user:', insertError);
    }
    return inserted;
  }
}

/**
 * Gets linked room for a Telegram chat.
 */
export async function getLinkedRoom(chatId: number) {
  const supabase = getTelegramSupabase();
  const { data, error } = await supabase
    .from('telegram_room_links')
    .select('*, room:rooms(*)')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching telegram room link:', error);
    return null;
  }
  return data;
}

/**
 * Links a telegram chat to a room.
 */
export async function linkChatToRoom(chatId: number, roomId: string, linkedByTgId: number) {
  const supabase = getTelegramSupabase();

  // Check if a link already exists
  const { data: existing, error: findError } = await supabase
    .from('telegram_room_links')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  if (findError) {
    console.error('Error finding room link:', findError);
  }

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('telegram_room_links')
      .update({
        room_id: roomId,
        linked_by: linkedByTgId,
      })
      .eq('telegram_chat_id', chatId)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Error updating room link:', updateError);
      return null;
    }
    return updated;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('telegram_room_links')
      .insert({
        room_id: roomId,
        telegram_chat_id: chatId,
        linked_by: linkedByTgId,
        created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (insertError) {
      console.error('Error inserting room link:', insertError);
      return null;
    }
    return inserted;
  }
}

/**
 * Logs a Telegram Bot command.
 */
export async function logTelegramCommand(tgUserId: number, command: string, roomId: string | null, payload: any, status: string) {
  const supabase = getTelegramSupabase();
  const { error } = await supabase
    .from('telegram_command_logs')
    .insert({
      telegram_user_id: tgUserId,
      command,
      room_id: roomId,
      payload: payload ? JSON.stringify(payload) : null,
      status,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error writing telegram command log:', error);
  }
}

/**
 * Checks if a Telegram user is the host of a room.
 */
export async function isUserHost(tgUserId: number, roomId: string): Promise<boolean> {
  const supabase = getTelegramSupabase();

  // Get Telegram user linked profile
  const { data: tgUser, error: uErr } = await supabase
    .from('telegram_users')
    .select('linked_profile_id')
    .eq('telegram_user_id', tgUserId)
    .maybeSingle();

  if (uErr || !tgUser || !tgUser.linked_profile_id) {
    return false;
  }

  // Get Room host_id
  const { data: room, error: rErr } = await supabase
    .from('rooms')
    .select('host_id')
    .eq('id', roomId)
    .maybeSingle();

  if (rErr || !room) {
    return false;
  }

  return room.host_id === tgUser.linked_profile_id;
}
