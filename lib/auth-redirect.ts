const PRODUCTION_SITE_URL = 'https://syncwaveapp.vercel.app';

function getSiteUrl(): string {
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    try {
      const parsed = new URL(configuredSite);
      if (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return parsed.origin;
      }
    } catch {
      // Ignore invalid configuration and continue to a safe fallback.
    }
  }

  if (typeof window !== 'undefined') {
    const current = new URL(window.location.href);
    // A production auth flow must never send users back to a dead localhost URL.
    if (current.hostname !== 'localhost' && current.hostname !== '127.0.0.1') {
      return current.origin;
    }
  }

  return PRODUCTION_SITE_URL;
}

export function getAuthRedirectUrl(path = '/auth/callback'): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}
