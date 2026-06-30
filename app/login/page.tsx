'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { getOrCreateProfile } from '@/lib/profile';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';
import { writeLog } from '@/lib/logger';
import { Mail, Key, ShieldAlert, CheckCircle, ArrowRight, Loader2, Activity } from 'lucide-react';

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPendingCreate(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate requests
    if (submitting) return;

    if (!email.trim() || !password) {
      setErrorMsg('Please specify both your email address and password credentials.');
      return;
    }

    // Client-side email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    writeLog('info', 'Login started', `Executing login transaction for: ${email}`);

    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Supabase client engine is unconfigured in this applet.');
      setSubmitting(false);
      return;
    }

    // 15 seconds promise timeout constraint
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Authenticating handshakes took longer than 15s. Operation aborted.'));
      }, 15000);
      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    const actionPromise = supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    try {
      const { data, error } = await Promise.race([actionPromise, timeoutPromise]);

      if (error) {
        throw error;
      }

      if (data?.user) {
        writeLog('success', 'Login success', `Confirmed security signature for identity: ${data.user.email}`);
        
        // Ensure user's profile database row is successfully retrieved/created before considering login successful
        setSuccessMsg('Verifying your user profile...');
        
        try {
          await getOrCreateProfile(data.user.id, data.user.email || '');
          writeLog('success', 'Profile loaded', `Verified and synchronized database profile for: ${data.user.id}`);
          setSuccessMsg('Access approved. Redirecting to your Wave Dashboard...');
          
          // Let local storage token write set and redirect
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
          // Do not allow authentication to succeed without a valid profile record! Sign them out!
          await supabase.auth.signOut();
          throw new Error(profileErr.message || 'We could not load your user profile record.');
        }
      } else {
        throw new Error('No user context returned from session handshakes.');
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
        
        {/* Crest logo */}
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

        {/* Message Callouts */}
        {errorMsg && (
          <div id="login-error-alert" className="bg-rose-50 border border-rose-200/85 text-rose-800 p-3 rounded-lg flex items-start space-x-2 text-xs leading-relaxed animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-900">Handshake Rejected</p>
              <p className="mt-0.5 text-stone-600">{errorMsg}</p>
              <button 
                onClick={handleLogin}
                className="mt-2 text-[11px] font-semibold text-rose-800 underline hover:text-rose-950 block transition"
              >
                Retry Request
              </button>
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

        {/* Credentials Form */}
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

        {/* Footer toggle */}
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
