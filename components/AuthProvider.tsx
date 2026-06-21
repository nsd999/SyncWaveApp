'use client';

import * as React from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getOrCreateProfile, Profile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import SupabaseSetupNeeded from './SupabaseSetupNeeded';
import { Database, AlertTriangle, Copy, Check, ExternalLink, X } from 'lucide-react';

interface AuthContextType {
  user: any;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<any>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const lastSyncedUserRef = React.useRef<string | null>(null);
  
  const [schemaError, setSchemaError] = React.useState<string | null>(null);
  const [dismissedSchemaError, setDismissedSchemaError] = React.useState<boolean>(false);
  const [migrationSql, setMigrationSql] = React.useState<string>('');
  const [copied, setCopied] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSchemaError = (e: Event) => {
      const errMessage = (e as CustomEvent).detail || '';
      console.log('[SyncWave Schema Alert] Schema error caught:', errMessage);
      setSchemaError(errMessage);
    };
    window.addEventListener('supabase-schema-error', handleSchemaError);
    return () => {
      window.removeEventListener('supabase-schema-error', handleSchemaError);
    };
  }, []);

  React.useEffect(() => {
    if (schemaError) {
      fetch('/api/db-schema')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.sql) {
            setMigrationSql(data.sql);
          }
        })
        .catch((err) => {
          console.error('Failed to load SQL migration contents:', err);
        });
    }
  }, [schemaError]);

  const copyToClipboard = () => {
    if (!migrationSql) return;
    navigator.clipboard.writeText(migrationSql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const configured = isSupabaseConfigured();

  const syncSession = React.useCallback(async (userId: string | null, email: string | null) => {
    const syncKey = `${userId}:${email}`;
    if (lastSyncedUserRef.current === syncKey) return;
    lastSyncedUserRef.current = syncKey;

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email }),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP Session synchronization status: ${res.status}`);
      }

      if (userId) {
        writeLog('success', 'Session refresh', `Synchronized secure cookie session for user id: ${userId}`);
      } else {
        writeLog('info', 'Session refresh', 'Successfully cleared secure cookie session');
      }
    } catch (err: any) {
      writeLog('error', 'Session refresh', `Failed syncing session state to middleware: ${err.message}`);
    }
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (!user) return;
    try {
      const activeProfile = await getOrCreateProfile(user.id, user.email || '');
      setProfile(activeProfile);
    } catch (err: any) {
      writeLog('error', 'Profile recovery', `Error refreshing profile: ${err.message}`);
    }
  }, [user]);

  React.useEffect(() => {
    if (!configured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    // Load active session immediately on page load safely
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        setUser(session.user);
        writeLog('success', 'Session restored', `Restored active server session for: ${session.user.email}`);
        
        // Sync cookie storage
        syncSession(session.user.id, session.user.email || null);
        
        // Recover profile
        getOrCreateProfile(session.user.id, session.user.email || '')
          .then((p) => {
            setProfile(p);
            writeLog('success', 'Profile recovery', `Profile loaded for username: @${p.username}`);
            setLoading(false);
          })
          .catch((e) => {
            writeLog('error', 'Profile recovery', `Error auto-creating profile: ${e.message}`);
            setLoading(false);
          });
      } else {
        writeLog('info', 'Session restored', 'No active user session resolved from cache');
        setLoading(false);
      }
    }).catch(err => {
      writeLog('error', 'Session restored', `Session fetch error: ${err.message}`);
      setLoading(false);
    });

    // Subscriptions for active authentication transitions
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const activeUser = session?.user || null;
      
      setUser(activeUser);

      if (activeUser) {
        writeLog('success', 'Session restored', `Auth session changed event: ${event} for ${activeUser.email}`);
        await syncSession(activeUser.id, activeUser.email || null);
        
        try {
          const p = await getOrCreateProfile(activeUser.id, activeUser.email || '');
          setProfile(p);
        } catch (e: any) {
          writeLog('error', 'Profile recovery', `Database profile recovery trigger error: ${e.message}`);
        }
      } else {
        if (event === 'SIGNED_OUT') {
          writeLog('success', 'Login success', 'Session cleared - User signed out');
        }
        setProfile(null);
        await syncSession(null, null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [configured, syncSession]);

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      writeLog('info', 'Login started', 'Initiating logout request...');
      try {
        await supabase.auth.signOut();
      } catch (err: any) {
        writeLog('error', 'Login failure', `Supabase signOut warning: ${err.message}`);
      }
    }
    
    // Manual cookie clear forcing to avoid lockouts
    await syncSession(null, null);
    setUser(null);
    setProfile(null);
    writeLog('success', 'Login success', 'Successfully signed out from SyncWave');
    window.location.href = '/login';
  };

  if (!configured) {
    return <SupabaseSetupNeeded />;
  }

  if (loading) {
    return (
      <div id="loader-root" className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div id="loader-box" className="flex flex-col items-center space-y-4 max-w-sm w-full">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
          </div>
          <p className="text-stone-500 font-mono text-xs tracking-wider animate-pulse uppercase">Establishing secure connection...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
      
      {schemaError && !dismissedSchemaError && (
        <div id="db-schema-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 text-stone-100 flex flex-col space-y-6 relative overflow-hidden">
            {/* Design header */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600"></div>
            
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    Supabase Schema Setup Required
                  </h3>
                  <p className="text-xs text-stone-400 font-mono">
                    Error code: POSTGREST_SCHEMA_MISSING
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setDismissedSchemaError(true)}
                className="p-1 rounded bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
                title="Dismiss and use local fallback sandbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Diagnostic Message */}
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-sm text-amber-200 leading-relaxed font-sans flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300">Could not resolve public.profiles table in Schema Cache</p>
                <p className="text-xs text-stone-400 mt-1">
                  The Supabase project associated with your environmental credentials does not have the database objects initialized. We mapped a robust auto-migration file to resolve this instantly.
                </p>
              </div>
            </div>

            {/* Instructions list */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2 font-mono">How to fix in 30 seconds:</h4>
              <ol className="text-xs space-y-2 text-stone-300 font-sans list-decimal list-inside pl-1">
                <li>
                  Click <strong className="text-amber-300">Copy Migration SQL</strong> below to copy the complete schema script.
                </li>
                <li>
                  Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline font-semibold inline-flex items-center gap-0.5">Supabase Console <ExternalLink className="w-3 h-3" /></a> and navigate to the <strong className="text-stone-100">SQL Editor</strong>.
                </li>
                <li>
                  Paste the copied script inside a <strong className="text-stone-100">New Query</strong> panel and click <strong className="text-green-400">Run</strong>.
                </li>
                <li>
                  Come back to this page and click <strong className="text-amber-300">Verify & Reload Cache</strong>!
                </li>
              </ol>
            </div>

            {/* Code Box */}
            <div className="relative">
              <div className="flex justify-between items-center bg-stone-950 px-3 py-1.5 rounded-t-lg border-t border-x border-stone-800 text-[10px] font-mono text-stone-400">
                <span>supabase/migrations/schema_and_profiles.sql</span>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-stone-950 border border-stone-800 rounded-b-lg p-3 max-h-36 overflow-y-auto text-[10px] font-mono text-emerald-400/90 leading-relaxed scrollbar-thin">
                {migrationSql || "-- Loading schema file contents from API...\n-- Safe fallback loaded if server takes too long."}
              </pre>
            </div>

            {/* Actions group */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={copyToClipboard}
                className="flex-1 py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'SQL Schema Copied!' : 'Copy Migration SQL'}
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2 px-4 rounded-lg bg-stone-800 hover:bg-stone-700 text-white font-medium text-sm border border-stone-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                Verify & Reload Cache
              </button>

              <button
                onClick={() => setDismissedSchemaError(true)}
                className="py-2 px-4 rounded-lg hover:bg-stone-800 hover:text-white text-stone-400 font-medium text-sm transition-colors cursor-pointer"
              >
                Dismiss & Run Offline
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
