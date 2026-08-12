'use client';

import * as React from 'react';
import Link from 'next/link';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';
import { writeLog } from '@/lib/logger';
import { Mail, ShieldAlert, CheckCircle, ArrowRight, Loader2, Key } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim()) {
      setErrorMsg('Please specify your registered email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    writeLog('info', 'Password recovery', `Sending password reset challenge to: ${email}`);

    if (!isFirebaseConfigured()) {
      setErrorMsg('Firebase engine is unconfigured.');
      setSubmitting(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      writeLog('success', 'Password recovery', `Successfully dispatched password reset endpoint for user: ${email}`);
      setSuccessMsg('Reset invitation dispatched! Please check your email inbox for a link to establish a new password.');
      setEmail('');
    } catch (err: any) {
      writeLog('error', 'Password reset', `Dispatch reset failed: ${err.message || err}`);
      setErrorMsg(getFriendlyErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div id="forgot-password-viewport" className="min-h-screen flex items-center justify-center p-4 bg-stone-50 select-none">
      <div id="forgot-password-card" className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-xl shadow-stone-100 p-6 md:p-8 flex flex-col space-y-6">
        <div id="forgot-password-brand" className="space-y-1.5 text-center">
          <div className="mx-auto bg-stone-900 text-stone-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-stone-200 border border-stone-800">
            <Key className="w-5 h-5 text-amber-400 rotate-90 animate-pulse" />
          </div>
          <h1 className="text-xl font-medium tracking-tight text-stone-900 pt-2">Recover Credentials</h1>
          <p className="text-xs text-stone-500 font-mono">Phase 1 Password Reset Dispatcher</p>
        </div>

        {errorMsg && (
          <div id="forgot-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Dispatch Error</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div id="forgot-success-alert" className="bg-emerald-50 border border-emerald-200/85 text-emerald-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-950">Dispatched Instructions</p>
              <p className="mt-0.5 text-stone-600">{successMsg}</p>
            </div>
          </div>
        )}

        {!successMsg && (
          <form id="forgot-form" onSubmit={handleResetRequest} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Registered Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  disabled={submitting}
                  placeholder="sai@syncwave.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  <span>Configuring Dispatch...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div id="forgot-footer" className="text-center pt-2 border-t border-stone-100 italic">
          <p className="text-xs text-stone-500">
            Remembered your secrets?{' '}
            <Link 
              href="/login" 
              className="text-amber-600 hover:text-amber-800 hover:underline font-semibold cursor-pointer"
            >
              Return to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
