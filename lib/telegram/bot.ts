export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Return empty string or fallback, but warn
    console.warn('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    return '8852342306:AAFXW37YzyP3MliqXRTMRKj33bd_hel0eNc'; // Fallback to provided token
  }
  return token;
}

/**
 * Send request to Telegram Bot API.
 */
async function callTelegramApi(method: string, payload: any) {
  const token = getBotToken();
  const url = `https://api.telegram.org/bot${token}/${method}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API error in ${method}:`, data);
    }
    return data;
  } catch (error) {
    console.error(`Exception calling Telegram API ${method}:`, error);
    return { ok: false, error };
  }
}

/**
 * Sets the Telegram bot webhook URL.
 */
export async function setBotWebhook(webhookUrl: string) {
  return callTelegramApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  });
}

/**
 * Sends a standard text message.
 */
export async function sendTextMessage(chatId: number | string, text: string, options: any = {}) {
  return callTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

/**
 * Sends a message with an inline keyboard.
 */
export async function sendMessageWithKeyboard(
  chatId: number | string,
  text: string,
  keyboard: InlineKeyboardButton[][],
  options: any = {}
) {
  return callTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: keyboard,
    },
    ...options,
  });
}

/**
 * Edits an existing message's text and keyboard.
 */
export async function editMessageTextAndKeyboard(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboardButton[][],
  options: any = {}
) {
  const payload: any = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...options,
  };
  if (keyboard) {
    payload.reply_markup = {
      inline_keyboard: keyboard,
    };
  }
  return callTelegramApi('editMessageText', payload);
}

/**
 * Answers a callback query.
 */
export async function answerCallback(callbackQueryId: string, text?: string, showAlert = false) {
  return callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

/**
 * Helper to construct standard companion buttons.
 */
export function getStandardCompanionButtons(roomSlug?: string, roomUrl?: string): InlineKeyboardButton[][] {
  const row1: InlineKeyboardButton[] = [
    { text: '▶ Play/Resume', callback_data: 'cmd_resume' },
    { text: '⏸ Pause', callback_data: 'cmd_pause' },
  ];
  const row2: InlineKeyboardButton[] = [
    { text: '⏭ Skip', callback_data: 'cmd_skip' },
    { text: '🎵 Queue', callback_data: 'cmd_queue' },
  ];
  const row3: InlineKeyboardButton[] = [
    { text: '🔄 Status', callback_data: 'cmd_status' }
  ];

  if (roomUrl) {
    row3.push({ text: '📤 Share', callback_data: `cmd_share_${roomSlug}` });
    row3.push({ text: '🌐 Open SyncWave', url: roomUrl });
  }

  return [row1, row2, row3];
}
