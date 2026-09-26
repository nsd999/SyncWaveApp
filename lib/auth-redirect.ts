export function getAuthRedirectUrl(path = '/auth/callback'): string {
  if (typeof window !== 'undefined') {
    return new URL(path, window.location.origin).toString();
  }

  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    return new URL(path, configuredSite.endsWith('/') ? configuredSite : `${configuredSite}/`).toString();
  }

  return path;
}
