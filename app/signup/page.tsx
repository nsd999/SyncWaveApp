'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getOrCreateProfile } from '@/lib/profile';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';
import { cleanBaseUsername } from '@/lib/username';
import { writeLog } from '@/lib/logger';
import { Mail, Key, ShieldAlert, CheckCircle, ArrowRight, Loader2, Activity, User } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [isPendingCreate, setIsPendingCreate] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('syncwave-pending-create') === 'true') {
      setIsPendingCreate(true);
    }
  }, []);

  const proposedUsername = email ? cleanBaseUsername(email.split('@')[0]) : '';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim() || !password) {
      setErrorMsg('Please specify both an email address and a strong password.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Your password should be at least 6 characters long.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    writeLog('info', 'Signup started', `Attempting signup for: ${email}`);

    if (!isFirebaseConfigured()) {
      setErrorMsg('Firebase client is unconfigured in this applet.');
      setSubmitting(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      if (user) {
        writeLog('success', 'Signup success', `Registered user in Firebase auth: ${user.email}`);
        setSuccessMsg('Initializing your SyncWave profile...');

        try {
          const resolvedDisplay = displayName.trim() || email.split('@')[0] || 'New Member';
          await getOrCreateProfile(user.uid, user.email || '', resolvedDisplay);
          writeLog('success', 'Profile created', `Profile created for: ${user.uid}`);

          setSuccessMsg('Account created! Loading dashboard...');
          setTimeout(() => {
            const pending = typeof window !== 'undefined' && localStorage.getItem('syncwave-pending-create') === 'true';
            if (pending) {
              router.replace('/');
            } else {
              router.replace('/dashboard');
            }
          }, 1000);
        } catch (profileErr: any) {
          writeLog('error', 'Signup failure', `Profile creation failed: ${profileErr.message}`);
          await auth.signOut();
          throw new Error(profileErr.message || 'We could not establish your user profile record.');
        }
      }
    } catch (err: any) {
      writeLog('error', 'Signup failure', `Signup sequence aborted: ${err.message || err}`);
      setErrorMsg(getFriendlyErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div id="signup-viewport" className="min-h-screen flex items-center justify-center p-4 bg-stone-50 select-none">
      <div id="signup-card" className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-xl shadow-stone-100 p-6 md:p-8 flex flex-col space-y-6">
        <div id="signup-brand" className="space-y-1.5 text-center">
          <div className="mx-auto bg-stone-900 text-stone-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-stone-200 border border-stone-800">
            <Activity className="w-5 h-5 text-amber-400 rotate-185 animate-pulse" />
          </div>
          <h1 className="text-xl font-medium tracking-tight text-stone-900 pt-2">Create Wave Identity</h1>
          <p className="text-xs text-stone-500 font-mono">Phase 1 Secure Registration Terminal</p>
        </div>

        {isPendingCreate && (
          <div id="pending-create-alert" className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs leading-relaxed text-center font-medium animate-fade-in shadow-sm">
            Create an account or sign in to host a SyncWave room.
          </div>
        )}

        {errorMsg && (
          <div id="signup-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Registration Denied</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div id="signup-success-alert" className="bg-emerald-50 border border-emerald-200/85 text-emerald-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-950">Registration Complete</p>
              <p className="mt-0.5 text-stone-600">{successMsg}</p>
            </div>
          </div>
        )}

        {!successMsg && (
          <form id="signup-form" onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Display Name (Optional)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  disabled={submitting}
                  placeholder="Sai Dheeraj"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full text-sm pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-stone-900 transition text-stone-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Email Address</label>
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
              {proposedUsername && (
                <p className="text-[10px] font-mono text-zinc-500 pt-1.5 flex items-center justify-between">
                  <span>Unique Proposed Suffix:</span>
                  <span className="text-amber-600 font-bold">@{proposedUsername}</span>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Secure Password</label>
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

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-stone-900 text-stone-100 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase hover:bg-stone-850 active:scale-98 transition flex items-center justify-center space-x-1.5 shadow-md shadow-stone-200 pointer mt-2 cursor-pointer disabled:bg-stone-400"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Validating Terminal...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div id="signup-footer" className="text-center pt-2 border-t border-stone-100">
          <p className="text-xs text-stone-500">
            Already have a wave identity?{' '}
            <Link 
              href="/login" 
              className="text-amber-600 hover:text-amber-800 hover:underline font-semibold cursor-pointer"
            >
              Sign In Terminal
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
