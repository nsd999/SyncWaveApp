'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { updatePassword } from 'firebase/auth';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';
import { writeLog } from '@/lib/logger';
import { Key, ShieldAlert, CheckCircle, ArrowRight, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!auth.currentUser) {
      writeLog('warn', 'Password recovery', 'Reset landing loaded without active session');
    }
  }, []);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!password) {
      setErrorMsg('Please specify a password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Your password should be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isFirebaseConfigured() || !auth.currentUser) {
      setErrorMsg('Not logged in or Firebase unconfigured.');
      setSubmitting(false);
      return;
    }

    try {
      await updatePassword(auth.currentUser, password);
      writeLog('success', 'Password reset', 'Successfully updated password');
      setSuccessMsg('Your security password keys have been refreshed!');
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1200);
    } catch (err: any) {
      writeLog('error', 'Password reset', `Aborted password change: ${err.message || err}`);
      setErrorMsg(getFriendlyErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div id="reset-viewport" className="min-h-screen flex items-center justify-center p-4 bg-stone-50 select-none">
      <div id="reset-card" className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-xl shadow-stone-100 p-6 md:p-8 flex flex-col space-y-6">
        <div id="reset-brand" className="space-y-1.5 text-center">
          <div className="mx-auto bg-stone-900 text-stone-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-stone-200 border border-stone-800">
            <Lock className="w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-xl font-medium tracking-tight text-stone-900 pt-2">Enter New Key</h1>
          <p className="text-xs text-stone-500 font-mono">Phase 1 Secure Credential Update</p>
        </div>

        {errorMsg && (
          <div id="reset-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Handshake Warning</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
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

        {!successMsg && (
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
