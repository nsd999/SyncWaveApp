'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const finishAuth = async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

        const oauthError = query.get('error_description') || query.get('error');
        if (oauthError) {
          throw new Error(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
        }

        // The browser Supabase client handles the PKCE code exchange when the
        // callback URL loads. Reading the session here waits for that exchange.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!data.session?.user) {
          throw new Error(
            hash.includes('access_token')
              ? 'Google authentication completed, but the session could not be restored.'
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

    finishAuth();
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
