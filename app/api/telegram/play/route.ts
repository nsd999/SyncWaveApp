import { NextRequest, NextResponse } from 'next/server';
import { findRoomBySlug, addMediaToQueue } from '@/lib/telegram/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { slug, media_url, title, added_by_name } = await req.json();

    if (!slug || !media_url) {
      return NextResponse.json({ error: 'Missing required fields: slug, media_url' }, { status: 400 });
    }

    const room = await findRoomBySlug(slug);
    if (!room) {
      return NextResponse.json({ error: '⚠️ That room isn\'t online anymore.' }, { status: 404 });
    }

    const name = added_by_name || 'Telegram Controller';
    const queued = await addMediaToQueue(room.id, media_url, title || 'Media Track', name);

    return NextResponse.json({ success: true, queued });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
