import { NextRequest, NextResponse } from 'next/server';
import { findRoomBySlug, updatePlaybackState } from '@/lib/telegram/db';

export async function POST(req: NextRequest) {
  try {
    const { slug } = await req.json();

    if (!slug) {
      return NextResponse.json({ error: 'Missing required field: slug' }, { status: 400 });
    }

    const room = await findRoomBySlug(slug);
    if (!room) {
      return NextResponse.json({ error: '⚠️ That room isn\'t online anymore.' }, { status: 404 });
    }

    const state = await updatePlaybackState(room.id, { is_playing: false });

    return NextResponse.json({ success: true, state });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
