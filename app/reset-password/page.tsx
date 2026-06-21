'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { writeLog } from '@/lib/logger';
import { Key, ShieldAlert, CheckCircle, ArrowRight, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Check if session exists (standard validation rule for reset paths)
  React.useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        writeLog('warn', 'Password recovery', 'Reset landing loaded without an active authenticated URL token session');
        setErrorMsg('Authentication token not resolved. Please ensure you clicked the full link dispatched to your inbox.');
      } else {
        writeLog('info', 'Password recovery', `Authenticated reset gateway ready for identity: ${session.user.email}`);
      }
    });
  }, []);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg('Please specify a typing replacement password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Review character structures.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    writeLog('info', 'Password reset', 'Attempting password change transaction');

    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Supabase execution framework is currently unconfigured.');
      setSubmitting(false);
      return;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Password transaction timed out (15 second safety cutoff reached).'));
      }, 15000);
      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    const actionPromise = supabase.auth.updateUser({
      password: password,
    });

    try {
      const { data, error } = await Promise.race([actionPromise, timeoutPromise]);

      if (error) {
        throw error;
      }

      writeLog('success', 'Password reset', 'Successfully updated security credential password signatures');
      setSuccessMsg('Your security password keys have been refreshed! Establishing handshake routes...');
      
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1200);
    } catch (err: any) {
      const message = err.message || 'Error executing credential update transaction.';
      writeLog('error', 'Password reset', `Aborted password change: ${message}`);
      setErrorMsg(message);
      setSubmitting(false);
    }
  };

  return (
    <div id="reset-viewport" className="min-h-screen flex items-center justify-center p-4 bg-stone-50 select-none">
      <div id="reset-card" className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-xl shadow-stone-100 p-6 md:p-8 flex flex-col space-y-6">
        
        {/* Logo Crest */}
        <div id="reset-brand" className="space-y-1.5 text-center">
          <div className="mx-auto bg-stone-900 text-stone-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-stone-200 border border-stone-800">
            <Lock className="w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-xl font-medium tracking-tight text-stone-900 pt-2">Enter New Key</h1>
          <p className="text-xs text-stone-500 font-mono">Phase 1 Secure Credential Update</p>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div id="reset-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Handshake Warning</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
              <button 
                onClick={handlePasswordReset}
                className="mt-2 text-[11px] font-semibold text-rose-800 underline hover:text-rose-950 block transition"
              >
                Retry Key Write
              </button>
            </div>
          </div>
        )}

        {successMsg && (
          <div id="reset-success-alert" className="bg-emerald-50 border border-emerald-200/85 text-emerald-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-950">Keys Refreshed</p>
              <p className="mt-0.5 text-stone-600">{successMsg}</p>
            </div>
          </div>
        )}

        {/* Input keys */}
        {(!successMsg && !errorMsg?.includes('Authentication token not resolved')) && (
          <form id="reset-form" onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">New Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <Key className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  disabled={submitting}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-stone-900 transition text-stone-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Confirm New Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <Key className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  disabled={submitting}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-sm pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-stone-900 transition text-stone-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-stone-900 text-stone-100 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase hover:bg-stone-850 active:scale-98 transition flex items-center justify-center space-x-1.5 shadow-md shadow-stone-200 pointer mt-2 cursor-pointer disabled:bg-stone-400"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Configuring Signatures...</span>
                </>
              ) : (
                <>
                  <span>Submit Secret Key</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div id="reset-footer" className="text-center pt-2 border-t border-stone-100 flex justify-center space-x-4">
          <Link 
            href="/login" 
            className="text-xs text-stone-500 hover:text-stone-805 font-medium cursor-pointer flex items-center space-x-1"
          >
            <span>Back to Login</span>
          </Link>
        </div>

      </div>
    </div>
  );
}
