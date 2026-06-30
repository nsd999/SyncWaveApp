import { NextRequest, NextResponse } from 'next/server';
import { findRoomBySlug, getRoomQueue } from '@/lib/telegram/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: 'Missing required parameter: slug' }, { status: 400 });
    }

    const room = await findRoomBySlug(slug);
    if (!room) {
      return NextResponse.json({ error: '⚠️ That room isn\'t online anymore.' }, { status: 404 });
    }

    const queue = await getRoomQueue(room.id);

    return NextResponse.json({ queue });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
