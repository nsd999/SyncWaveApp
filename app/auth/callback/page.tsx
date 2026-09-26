'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, ShieldAlert } from 'lucide-react';

function decodeOAuthError(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const finishAuth = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        const oauthError =
          url.searchParams.get('error_description') ||
          url.searchParams.get('error');

        if (oauthError) {
          throw new Error(decodeOAuthError(oauthError));
        }

        // Supabase may have already restored the session automatically when the
        // browser client detected the callback URL. Reuse that session first.
        let { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        // For PKCE callbacks, explicitly exchange the one-time OAuth code when
        // automatic URL handling has not produced a session yet.
        if (!data.session?.user && code) {
          const exchange = await supabase.auth.exchangeCodeForSession(code);
          if (exchange.error) throw exchange.error;
          data = exchange.data;
        }

        // Email confirmation/passwordless flows can return tokens in the hash.
        // If Supabase has not restored them automatically, restore the session
        // from the access/refresh token pair.
        if (!data.session?.user) {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');

          if (accessToken && refreshToken) {
            const restored = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (restored.error) throw restored.error;
            data = restored.data;
          }
        }

        if (!data.session?.user) {
          throw new Error(
            code
              ? 'Google authentication returned a code, but Supabase could not create a session.'
              : 'No active authentication session was returned.'
          );
        }

        if (!active) return;

        const pending = localStorage.getItem('syncwave-pending-create') === 'true';
        router.replace(pending ? '/' : '/dashboard');
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Google authentication could not be completed.');
      }
    };

    void finishAuth();

    return () => {
      active = false;
    };
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <section className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <h1 className="font-semibold text-stone-900">Google sign-in could not finish</h1>
              <p className="mt-1 text-sm text-stone-600">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-5 w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Return to Sign In
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
        <span className="text-sm font-medium text-stone-700">Completing secure Google sign-in…</span>
      </div>
    </main>
  );
}
