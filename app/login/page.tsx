'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getOrCreateProfile } from '@/lib/profile';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';
import { writeLog } from '@/lib/logger';
import { Mail, Key, ShieldAlert, CheckCircle, ArrowRight, Loader2, Activity } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [isPendingCreate, setIsPendingCreate] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('syncwave-pending-create') === 'true') {
      setIsPendingCreate(true);
    }
  }, []);

  const handleGoogleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    writeLog('info', 'Google Login started', `Executing Google login transaction`);

    if (!isFirebaseConfigured()) {
      setErrorMsg('Firebase engine is unconfigured in this applet.');
      setSubmitting(false);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      if (user) {
        writeLog('success', 'Google Login success', `Confirmed identity: ${user.email}`);
        setSuccessMsg('Verifying your user profile...');

        try {
          await getOrCreateProfile(user.uid, user.email || '', user.displayName || 'Google User');
          writeLog('success', 'Profile loaded', `Verified profile for: ${user.uid}`);
          setSuccessMsg('Access approved. Redirecting to your Wave Dashboard...');

          setTimeout(() => {
            const pending = typeof window !== 'undefined' && localStorage.getItem('syncwave-pending-create') === 'true';
            if (pending) {
              router.replace('/');
            } else {
              router.replace('/dashboard');
            }
          }, 800);
        } catch (profileErr: any) {
          writeLog('error', 'Login failure', `Profile constraint failed: ${profileErr.message}`);
          await auth.signOut();
          throw new Error(profileErr.message || 'We could not load your user profile record.');
        }
      }
    } catch (err: any) {
      writeLog('error', 'Google Login failure', `Login transaction aborted: ${err.message || err}`);
      setErrorMsg(getFriendlyErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim() || !password) {
      setErrorMsg('Please specify both your email address and password credentials.');
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

    writeLog('info', 'Login started', `Executing login transaction for: ${email}`);

    if (!isFirebaseConfigured()) {
      setErrorMsg('Firebase engine is unconfigured in this applet.');
      setSubmitting(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      if (user) {
        writeLog('success', 'Login success', `Confirmed identity: ${user.email}`);
        setSuccessMsg('Verifying your user profile...');

        try {
          await getOrCreateProfile(user.uid, user.email || '');
          writeLog('success', 'Profile loaded', `Verified profile for: ${user.uid}`);
          setSuccessMsg('Access approved. Redirecting to your Wave Dashboard...');

          setTimeout(() => {
            const pending = typeof window !== 'undefined' && localStorage.getItem('syncwave-pending-create') === 'true';
            if (pending) {
              router.replace('/');
            } else {
              router.replace('/dashboard');
            }
          }, 800);
        } catch (profileErr: any) {
          writeLog('error', 'Login failure', `Profile constraint failed: ${profileErr.message}`);
          await auth.signOut();
          throw new Error(profileErr.message || 'We could not load your user profile record.');
        }
      }
    } catch (err: any) {
      writeLog('error', 'Login failure', `Login transaction aborted: ${err.message || err}`);
      setErrorMsg(getFriendlyErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div id="login-viewport" className="min-h-screen flex items-center justify-center p-4 bg-stone-50 select-none">
      <div id="login-card" className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-xl shadow-stone-100 p-6 md:p-8 flex flex-col space-y-6">
        <div id="login-brand" className="space-y-1.5 text-center">
          <div className="mx-auto bg-stone-900 text-stone-50 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-stone-200 border border-stone-800">
            <Activity className="w-5 h-5 animate-pulse text-amber-400" />
          </div>
          <h1 className="text-xl font-medium tracking-tight text-stone-900 pt-2 selection:bg-amber-100">Welcome to SyncWave</h1>
          <p className="text-xs text-stone-500 font-mono">Phase 1 Foundation Access Terminal</p>
        </div>

        {isPendingCreate && (
          <div id="pending-create-alert" className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs leading-relaxed text-center font-medium animate-fade-in shadow-sm">
            Create an account or sign in to host a SyncWave room.
          </div>
        )}

        {errorMsg && (
          <div id="login-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Handshake Rejected</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div id="login-success-alert" className="bg-emerald-50 border border-emerald-200/85 text-emerald-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-950">Handshake Approved</p>
              <p className="mt-0.5 text-stone-600">{successMsg}</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full bg-white border border-stone-200 text-stone-700 py-2 rounded-lg text-xs font-semibold tracking-wider hover:bg-stone-50 active:scale-98 transition flex items-center justify-center space-x-2 shadow-sm pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-stone-200"></div>
            <span className="flex-shrink-0 mx-4 text-stone-400 text-xs font-mono">OR</span>
            <div className="flex-grow border-t border-stone-200"></div>
          </div>

        <form id="login-form" onSubmit={handleLogin} className="space-y-4">
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
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Password</label>
              <Link 
                href="/forgot-password" 
                className="text-[11px] font-mono uppercase tracking-wider text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
              >
                Reset Keys
              </Link>
            </div>
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
            className="w-full bg-stone-900 text-stone-100 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase hover:bg-stone-850 active:scale-98 transition flex items-center justify-center space-x-1.5 shadow-md shadow-stone-200 hover:shadow-stone-300 pointer mt-2 cursor-pointer disabled:bg-stone-400 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Verifying Sig...</span>
              </>
            ) : (
              <>
                <span>Sign In Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
        </div>
        <div id="login-footer" className="text-center pt-2 border-t border-stone-100">
          <p className="text-xs text-stone-500">
            Need a secure wave profile?{' '}
            <Link 
              href="/signup" 
              className="text-amber-600 hover:text-amber-800 hover:underline font-semibold cursor-pointer"
            >
              Sign Up Form
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
