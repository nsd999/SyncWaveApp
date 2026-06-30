import { NextRequest, NextResponse } from 'next/server';
import { findRoomBySlug, getRoomMembers, getPlaybackState, getRoomQueue } from '@/lib/telegram/db';

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

    const [members, pbState, queue] = await Promise.all([
      getRoomMembers(room.id),
      getPlaybackState(room.id),
      getRoomQueue(room.id)
    ]);

    const hostName = room.host?.display_name || room.host?.email || 'Host';

    return NextResponse.json({
      room: {
        name: room.name,
        slug: room.slug,
        host_name: hostName
      },
      playback: {
        media_url: pbState?.media_url || null,
        media_type: pbState?.media_type || null,
        is_playing: pbState?.is_playing || false,
        current_time: pbState?.current_time || 0,
        duration: pbState?.duration || 0,
      },
      participants_count: members.length,
      queue_length: queue.length
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
