import { NextRequest, NextResponse } from 'next/server';
import { 
  findRoomBySlug, 
  getRoomMembers, 
  getPlaybackState, 
  updatePlaybackState, 
  getRoomQueue, 
  addMediaToQueue, 
  skipTrack, 
  upsertTelegramUser, 
  getLinkedRoom, 
  linkChatToRoom, 
  logTelegramCommand, 
  isUserHost 
} from '@/lib/telegram/db';
import { 
  sendTextMessage, 
  sendMessageWithKeyboard, 
  editMessageTextAndKeyboard, 
  answerCallback, 
  getStandardCompanionButtons 
} from '@/lib/telegram/bot';

// Helper to format time in MM:SS
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Check secure token signature if configured
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && incomingSecret !== expectedSecret) {
      console.warn('Webhook secret token mismatch. Rejected unauthorized call.');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    console.log('--- RECEIVED TELEGRAM BOT UPDATE ---', JSON.stringify(body, null, 2));

    // Handle standard messages
    if (body.message) {
      const message = body.message;
      const chat = message.chat;
      const from = message.from;
      const text = message.text ? message.text.trim() : '';

      if (!from || !chat) {
        return NextResponse.json({ ok: true });
      }

      // Upsert/ensure telegram user is registered in database
      const tgUser = await upsertTelegramUser({
        telegram_user_id: from.id,
        username: from.username,
        first_name: from.first_name,
        last_name: from.last_name,
      });

      // Get app dynamic root URL
      const appUrl = process.env.APP_URL || 'https://syncwaveapp.vercel.app';

      // 1. /start command
      if (text.startsWith('/start')) {
        const param = text.substring(6).trim(); // check for link param e.g. "link_PROFILEID_SLUG"
        let responseMsg = `👋 <b>Welcome to SyncWaveBot!</b>\n\nThe easiest way to control your SyncWave synchronized listening rooms directly from Telegram.`;
        let roomSlugToLink: string | null = null;

        if (param.startsWith('link_')) {
          const parts = param.split('_'); // link_PROFILEID or link_PROFILEID_SLUG
          const profileId = parts[1];
          const optionalSlug = parts[2];

          if (profileId) {
            await upsertTelegramUser({
              telegram_user_id: from.id,
              linked_profile_id: profileId,
            });
            responseMsg = `👋 <b>Welcome to SyncWaveBot!</b>\n\n🎉 <b>Your profile is now securely linked!</b> You are authorized to control rooms you host directly from Telegram.\n\nThe website remains the single source of truth for zero-lag playback sync.`;
            if (optionalSlug) {
              roomSlugToLink = optionalSlug;
            }
          }
        }

        // If a room slug is found during linking, auto-link it!
        if (roomSlugToLink) {
          const targetRoom = await findRoomBySlug(roomSlugToLink);
          if (targetRoom) {
            await linkChatToRoom(chat.id, targetRoom.id, from.id);
            responseMsg += `\n\n🏠 <b>Auto-connected to Room:</b> ${targetRoom.name} (${targetRoom.slug})`;
          }
        }

        await sendMessageWithKeyboard(chat.id, responseMsg, [
          [
            { text: 'Create New Room', url: `${appUrl}/` },
            { text: 'Open SyncWave', url: appUrl }
          ],
          [
            { text: '📖 Help & Commands', callback_data: 'cmd_help' }
          ]
        ]);

        await logTelegramCommand(from.id, '/start', null, { param }, 'success');
        return NextResponse.json({ ok: true });
      }

      // 2. /help command
      if (text.startsWith('/help')) {
        const helpText = `<b>📖 SyncWaveBot Commands:</b>\n\n` +
          `/start - Launch companion remote controller\n` +
          `/join ROOMCODE - Link this chat to a SyncWave room\n` +
          `/room - View current room details and controller remote\n` +
          `/play URL - Queue or play a track (YouTube/MP3/MP4)\n` +
          `/queue - Display unplayed tracks in queue\n` +
          `/skip - (Host only) Skip currently playing track\n` +
          `/pause - (Host only) Pause playback\n` +
          `/resume - (Host only) Resume playback\n` +
          `/status - Get detailed room, host & playback status\n` +
          `/invite - Share the room invitation link`;

        await sendTextMessage(chat.id, helpText);
        await logTelegramCommand(from.id, '/help', null, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 3. /join command
      if (text.startsWith('/join')) {
        const slugPart = text.replace(/^\/join/, '').trim().toUpperCase();
        if (!slugPart) {
          await sendTextMessage(chat.id, '⚠️ Please provide a room code!\n\nExample: <code>/join SLJTRP</code>');
          return NextResponse.json({ ok: true });
        }

        const room = await findRoomBySlug(slugPart);
        if (!room) {
          await sendTextMessage(
            chat.id,
            '⚠️ That room isn\'t online anymore.\n\nAsk your friend for a fresh invite or create a new vibe.'
          );
          await logTelegramCommand(from.id, '/join', null, { slug: slugPart }, 'not_found');
          return NextResponse.json({ ok: true });
        }

        // Link this chat to the room
        await linkChatToRoom(chat.id, room.id, from.id);

        const members = await getRoomMembers(room.id);
        const pbState = await getPlaybackState(room.id);
        const queue = await getRoomQueue(room.id);

        const nowPlaying = pbState?.media_url ? (queue.length > 0 ? queue[0].title : pbState.media_url.substring(pbState.media_url.lastIndexOf('/') + 1)) : 'No Active Stream';

        const statusMsg = `🟢 <b>Room Connected Successfully!</b>\n\n` +
          `🏠 <b>Room Name:</b> ${room.name}\n` +
          `👥 <b>Participants:</b> ${members.length} active\n` +
          `🎵 <b>Now Playing:</b> ${nowPlaying}\n` +
          `📦 <b>Queue length:</b> ${queue.length} track(s)`;

        const roomUrl = `${appUrl}/room/${room.slug}`;
        const keyboard = getStandardCompanionButtons(room.slug, roomUrl);

        await sendMessageWithKeyboard(chat.id, statusMsg, keyboard);
        await logTelegramCommand(from.id, '/join', room.id, { slug: slugPart }, 'success');
        return NextResponse.json({ ok: true });
      }

      // Fetch linked room for checking subsequent control commands
      const linked = await getLinkedRoom(chat.id);
      const room = linked?.room;

      // 4. /room command
      if (text.startsWith('/room')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const members = await getRoomMembers(room.id);
        const pbState = await getPlaybackState(room.id);
        const queue = await getRoomQueue(room.id);

        const nowPlaying = pbState?.media_url ? (queue.length > 0 ? queue[0].title : pbState.media_url.substring(pbState.media_url.lastIndexOf('/') + 1)) : 'No Active Stream';

        const msg = `🏠 <b>Room Details:</b>\n\n` +
          `<b>Name:</b> ${room.name}\n` +
          `<b>Code:</b> ${room.slug}\n` +
          `<b>Participants:</b> ${members.length} connected\n` +
          `<b>Now Playing:</b> ${nowPlaying}\n` +
          `<b>Queue length:</b> ${queue.length} track(s)`;

        const roomUrl = `${appUrl}/room/${room.slug}`;
        const keyboard = getStandardCompanionButtons(room.slug, roomUrl);

        await sendMessageWithKeyboard(chat.id, msg, keyboard);
        await logTelegramCommand(from.id, '/room', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 5. /play command
      if (text.startsWith('/play')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const mediaUrl = text.replace(/^\/play/, '').trim();
        if (!mediaUrl) {
          await sendTextMessage(chat.id, '⚠️ Please provide a URL!\n\nExample: <code>/play https://www.youtube.com/watch?v=dQw4w9WgXcQ</code>');
          return NextResponse.json({ ok: true });
        }

        // Validate supported format
        const isYouTube = mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('music.youtube.com');
        const isDirect = mediaUrl.endsWith('.mp3') || mediaUrl.endsWith('.mp4') || mediaUrl.includes('.mp3?') || mediaUrl.includes('.mp4?');

        if (!isYouTube && !isDirect) {
          await sendTextMessage(chat.id, '⚠️ Unsupported link! SyncWaveBot supports YouTube, YouTube Music, direct MP3, and direct MP4 URLs.');
          return NextResponse.json({ ok: true });
        }

        // Validate Host privileges
        const userAuthorized = await isUserHost(from.id, room.id);
        if (!userAuthorized) {
          await sendTextMessage(chat.id, 'Only the host can control playback.');
          await logTelegramCommand(from.id, '/play', room.id, { url: mediaUrl }, 'permission_denied');
          return NextResponse.json({ ok: true });
        }

        // Retrieve video metadata dynamically if possible
        let title = 'Direct Media Stream';
        if (isYouTube) {
          try {
            const ytResponse = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(mediaUrl)}&format=json`);
            if (ytResponse.ok) {
              const oembed = await ytResponse.json();
              if (oembed?.title) title = oembed.title;
            } else {
              title = 'YouTube Video';
            }
          } catch {
            title = 'YouTube Video';
          }
        } else {
          title = mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1).split('?')[0] || 'Direct Stream';
        }

        // Add to queue
        const authorName = from.first_name || from.username || 'SyncWaveBot';
        await addMediaToQueue(room.id, mediaUrl, title, authorName);

        await sendTextMessage(chat.id, `🎵 Added to queue: <b>${title}</b>`);
        await logTelegramCommand(from.id, '/play', room.id, { url: mediaUrl, title }, 'success');
        return NextResponse.json({ ok: true });
      }

      // 6. /queue command
      if (text.startsWith('/queue')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const queue = await getRoomQueue(room.id);
        if (queue.length === 0) {
          await sendTextMessage(chat.id, 'The queue is currently empty. Add tracks using <code>/play &lt;URL&gt;</code>!');
          return NextResponse.json({ ok: true });
        }

        let queueList = `<b>🎵 Current Playback Queue (${queue.length} track(s)):</b>\n\n`;
        queue.forEach((item, index) => {
          queueList += `${index + 1}. <b>${item.title || 'Untitled Track'}</b>\n` +
            `   🔗 <i>Requested by: ${item.added_by_name || 'Host'}</i>\n\n`;
        });

        await sendTextMessage(chat.id, queueList);
        await logTelegramCommand(from.id, '/queue', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 7. /skip command
      if (text.startsWith('/skip')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const userAuthorized = await isUserHost(from.id, room.id);
        if (!userAuthorized) {
          await sendTextMessage(chat.id, 'Only the host can control playback.');
          return NextResponse.json({ ok: true });
        }

        await skipTrack(room.id);
        await sendTextMessage(chat.id, '⏭ <b>Skipped to next track!</b>');
        await logTelegramCommand(from.id, '/skip', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 8. /pause command
      if (text.startsWith('/pause')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const userAuthorized = await isUserHost(from.id, room.id);
        if (!userAuthorized) {
          await sendTextMessage(chat.id, 'Only the host can control playback.');
          return NextResponse.json({ ok: true });
        }

        await updatePlaybackState(room.id, { is_playing: false });
        await sendTextMessage(chat.id, '⏸ <b>Playback paused.</b>');
        await logTelegramCommand(from.id, '/pause', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 9. /resume command
      if (text.startsWith('/resume')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const userAuthorized = await isUserHost(from.id, room.id);
        if (!userAuthorized) {
          await sendTextMessage(chat.id, 'Only the host can control playback.');
          return NextResponse.json({ ok: true });
        }

        await updatePlaybackState(room.id, { is_playing: true });
        await sendTextMessage(chat.id, '▶ <b>Playback resumed.</b>');
        await logTelegramCommand(from.id, '/resume', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 10. /status command
      if (text.startsWith('/status')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const members = await getRoomMembers(room.id);
        const pbState = await getPlaybackState(room.id);
        const queue = await getRoomQueue(room.id);

        const nowPlaying = pbState?.media_url ? (queue.length > 0 ? queue[0].title : pbState.media_url.substring(pbState.media_url.lastIndexOf('/') + 1)) : 'No Active Stream';

        const hostName = room.host?.display_name || room.host?.email || 'Host';

        const statusMsg = `<b>SyncWave Room Status:</b>\n\n` +
          `🏠 <b>Room:</b> ${room.name} (${room.slug})\n` +
          `🎵 <b>Now Playing:</b> ${nowPlaying}\n` +
          `⏱ <b>Playback Position:</b> ${formatTime(Number(pbState?.current_time || 0))} / ${formatTime(Number(pbState?.duration || 0))} [${pbState?.is_playing ? 'PLAYING' : 'PAUSED'}]\n` +
          `👑 <b>Host:</b> ${hostName}\n` +
          `👥 <b>Participants:</b> ${members.length} active connected`;

        await sendTextMessage(chat.id, statusMsg);
        await logTelegramCommand(from.id, '/status', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }

      // 11. /invite command
      if (text.startsWith('/invite')) {
        if (!room) {
          await sendTextMessage(chat.id, '⚠️ No room linked to this chat.\n\nUse <code>/join ROOMCODE</code> to link your listening lounge.');
          return NextResponse.json({ ok: true });
        }

        const inviteLink = `${appUrl}/room/${room.slug}`;
        await sendTextMessage(chat.id, `✉️ <b>Join SyncWave Room Invite:</b>\n\n🏠 Room: ${room.name}\n🔗 Link: ${inviteLink}`);
        await logTelegramCommand(from.id, '/invite', room.id, null, 'success');
        return NextResponse.json({ ok: true });
      }
    }

    // Handle Callback Queries (button clicks)
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data;
      const from = cb.from;
      const message = cb.message;

      if (!message || !data) {
        return NextResponse.json({ ok: true });
      }

      const chatId = message.chat.id;
      const linked = await getLinkedRoom(chatId);
      const room = linked?.room;
      const appUrl = process.env.APP_URL || 'https://syncwaveapp.vercel.app';

      if (data === 'cmd_help') {
        const helpText = `<b>📖 SyncWaveBot Commands:</b>\n\n` +
          `/start - Launch companion remote controller\n` +
          `/join ROOMCODE - Link this chat to a SyncWave room\n` +
          `/room - View current room details and controller remote\n` +
          `/play URL - Queue or play a track (YouTube/MP3/MP4)\n` +
          `/queue - Display unplayed tracks in queue\n` +
          `/skip - (Host only) Skip currently playing track\n` +
          `/pause - (Host only) Pause playback\n` +
          `/resume - (Host only) Resume playback\n` +
          `/status - Get detailed room, host & playback status\n` +
          `/invite - Share the room invitation link`;

        await sendTextMessage(chatId, helpText);
        await answerCallback(cb.id);
        return NextResponse.json({ ok: true });
      }

      if (!room) {
        await answerCallback(cb.id, '⚠️ No room linked to this chat. Use /join ROOMCODE.', true);
        return NextResponse.json({ ok: true });
      }

      // Handle standard controls via inline buttons
      if (data === 'cmd_resume') {
        const authorized = await isUserHost(from.id, room.id);
        if (!authorized) {
          await answerCallback(cb.id, 'Only the host can control playback.', true);
          return NextResponse.json({ ok: true });
        }
        await updatePlaybackState(room.id, { is_playing: true });
        await answerCallback(cb.id, '▶ Playback resumed.');
        await sendTextMessage(chatId, '▶ <b>Playback resumed.</b>');
        return NextResponse.json({ ok: true });
      }

      if (data === 'cmd_pause') {
        const authorized = await isUserHost(from.id, room.id);
        if (!authorized) {
          await answerCallback(cb.id, 'Only the host can control playback.', true);
          return NextResponse.json({ ok: true });
        }
        await updatePlaybackState(room.id, { is_playing: false });
        await answerCallback(cb.id, '⏸ Playback paused.');
        await sendTextMessage(chatId, '⏸ <b>Playback paused.</b>');
        return NextResponse.json({ ok: true });
      }

      if (data === 'cmd_skip') {
        const authorized = await isUserHost(from.id, room.id);
        if (!authorized) {
          await answerCallback(cb.id, 'Only the host can control playback.', true);
          return NextResponse.json({ ok: true });
        }
        await skipTrack(room.id);
        await answerCallback(cb.id, '⏭ Skipped to next track.');
        await sendTextMessage(chatId, '⏭ <b>Skipped to next track!</b>');
        return NextResponse.json({ ok: true });
      }

      if (data === 'cmd_queue') {
        const queue = await getRoomQueue(room.id);
        if (queue.length === 0) {
          await answerCallback(cb.id, 'The queue is currently empty.');
          await sendTextMessage(chatId, 'The queue is currently empty. Add tracks using <code>/play &lt;URL&gt;</code>!');
          return NextResponse.json({ ok: true });
        }

        let queueList = `<b>🎵 Current Playback Queue (${queue.length} track(s)):</b>\n\n`;
        queue.forEach((item, index) => {
          queueList += `${index + 1}. <b>${item.title || 'Untitled Track'}</b>\n` +
            `   🔗 <i>Requested by: ${item.added_by_name || 'Host'}</i>\n\n`;
        });

        await answerCallback(cb.id, 'Displaying queue...');
        await sendTextMessage(chatId, queueList);
        return NextResponse.json({ ok: true });
      }

      if (data === 'cmd_status') {
        const members = await getRoomMembers(room.id);
        const pbState = await getPlaybackState(room.id);
        const queue = await getRoomQueue(room.id);

        const nowPlaying = pbState?.media_url ? (queue.length > 0 ? queue[0].title : pbState.media_url.substring(pbState.media_url.lastIndexOf('/') + 1)) : 'No Active Stream';

        const hostName = room.host?.display_name || room.host?.email || 'Host';

        const statusMsg = `<b>SyncWave Room Status:</b>\n\n` +
          `🏠 <b>Room:</b> ${room.name} (${room.slug})\n` +
          `🎵 <b>Now Playing:</b> ${nowPlaying}\n` +
          `⏱ <b>Playback Position:</b> ${formatTime(Number(pbState?.current_time || 0))} / ${formatTime(Number(pbState?.duration || 0))} [${pbState?.is_playing ? 'PLAYING' : 'PAUSED'}]\n` +
          `👑 <b>Host:</b> ${hostName}\n` +
          `👥 <b>Participants:</b> ${members.length} active connected`;

        const roomUrl = `${appUrl}/room/${room.slug}`;
        const keyboard = getStandardCompanionButtons(room.slug, roomUrl);

        // Edit the message with refreshed status to avoid spamming the channel!
        await editMessageTextAndKeyboard(chatId, message.message_id, statusMsg, keyboard);
        await answerCallback(cb.id, 'Refreshed status!');
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith('cmd_share_')) {
        const slug = data.replace('cmd_share_', '');
        const inviteLink = `${appUrl}/room/${slug}`;
        await answerCallback(cb.id, 'Generating share message...');
        await sendTextMessage(chatId, `✉️ <b>Join SyncWave Room Invite:</b>\n\n🏠 Room: ${room.name}\n🔗 Link: ${inviteLink}`);
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook processing exception:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
