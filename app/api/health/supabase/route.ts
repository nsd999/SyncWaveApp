import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TIMEOUT_MS = 4500;

function json(status: string, message: string, httpStatus: number, code?: string) {
  return NextResponse.json({ status, message, ...(code ? { code } : {}) }, {
    status: httpStatus,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !key) {
    return json(
      'not_configured',
      'SyncWave has no Supabase URL or publishable key configured for this deployment. Configure the intended project in Vercel and redeploy.',
      503,
      'SUPABASE_ENV_MISSING'
    );
  }

  let origin: URL;
  try {
    origin = new URL(url);
    if (origin.protocol !== 'https:' && origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') {
      return json('unavailable', 'The configured database URL is not a valid HTTPS endpoint.', 503, 'SUPABASE_URL_INVALID');
    }
  } catch {
    return json('unavailable', 'The configured database URL is invalid. Check the Vercel Supabase URL setting.', 503, 'SUPABASE_URL_INVALID');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${origin.origin}/rest/v1/rooms?select=id&limit=0`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.ok) {
      return json('connected', 'SyncWave database connection is available.', 200);
    }

    if (response.status === 401 || response.status === 403) {
      return json('unavailable', 'The database rejected the configured publishable key or permissions. Verify that the URL and key belong to the same Supabase project.', 503, 'SUPABASE_AUTH_REJECTED');
    }

    if (response.status === 404) {
      return json('schema_missing', 'The database endpoint responded, but the SyncWave rooms table was not found. Apply the correct SyncWave schema to this project.', 503, 'SUPABASE_ROOMS_TABLE_MISSING');
    }

    if (response.status >= 500) {
      return json('unavailable', 'The Supabase service returned a server error. Check the project status and try again.', 503, 'SUPABASE_UPSTREAM_ERROR');
    }

    return json('unavailable', 'The database responded but rejected the SyncWave health check. Verify the project URL, publishable key, and table access.', 503, 'SUPABASE_HEALTH_CHECK_REJECTED');
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return json('unavailable', 'The configured Supabase host did not respond within 4.5 seconds. Check whether the project is active and the URL is correct.', 503, 'SUPABASE_CONNECTION_TIMEOUT');
    }
    return json('unavailable', 'SyncWave could not connect to the configured Supabase host. Check the project URL, project status, and network access.', 503, 'SUPABASE_CONNECTION_FAILED');
  } finally {
    clearTimeout(timer);
  }
}
