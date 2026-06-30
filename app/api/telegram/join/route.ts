import { NextRequest, NextResponse } from 'next/server';
import { findRoomBySlug, linkChatToRoom } from '@/lib/telegram/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { slug, telegram_chat_id, telegram_user_id } = await req.json();

    if (!slug || !telegram_chat_id || !telegram_user_id) {
      return NextResponse.json({ error: 'Missing required fields: slug, telegram_chat_id, telegram_user_id' }, { status: 400 });
    }

    const room = await findRoomBySlug(slug);
    if (!room) {
      return NextResponse.json({ error: '⚠️ That room isn\'t online anymore.' }, { status: 404 });
    }

    const link = await linkChatToRoom(Number(telegram_chat_id), room.id, Number(telegram_user_id));

    return NextResponse.json({ success: true, link });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
