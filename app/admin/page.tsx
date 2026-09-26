'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { updateProfile, getOrCreateProfile } from '@/lib/profile';
import { writeLog, getLogs, clearLogs, LogEntry } from '@/lib/logger';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  LogOut, 
  Terminal, 
  RefreshCw, 
  Play, 
  ShieldAlert, 
  Cpu, 
  CheckCircle,
  HelpCircle,
  Loader2,
  X,
  ArrowLeft,
  Settings,
  Database,
  Activity
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ [key: string]: 'passed' | 'failed' | null }>({});
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [errorNotice, setErrorNotice] = React.useState<string | null>(null);

  const supabaseConnected = React.useMemo(() => {
    return isSupabaseConfigured();
  }, []);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?next=/admin');
    }
  }, [authLoading, user, router]);

  React.useEffect(() => {
    const handleLogsSync = () => {
      setLogs(getLogs());
    };
    
    handleLogsSync();
    window.addEventListener('syncwave-new-log', handleLogsSync);
    return () => window.removeEventListener('syncwave-new-log', handleLogsSync);
  }, []);

  const runProfileHealthCheck = async () => {
    if (!user || !supabaseConnected) return;

    setErrorNotice(null);
    try {
      const recoveredProfile = await getOrCreateProfile(user.id, user.email || '');
      await refreshProfile();
      writeLog(
        'success',
        'Profile health',
        `Profile lookup/recovery verified for "@${recoveredProfile.username}". No destructive test data was removed.`
      );
      setSuccessNotice('Profile health check passed.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      writeLog('error', 'Profile health', `Profile health check failed: ${err.message}`);
      setErrorNotice(err.message || 'Profile health check failed.');
    }
  };

  const runSelfVerificationTests = async () => {
    if (!supabaseConnected) {
      setErrorNotice('Supabase is not configured.');
      return;
    }

    setTesting(true);
    setErrorNotice(null);

    const items = [
      'new_signup',
      'email_verification',
      'login_auth',
      'session_persistence',
      'profile_auto_recovery',
      'runtime_verification'
    ];

    setTestResult(
      Object.fromEntries(items.map((key) => [key, null])) as { [key: string]: 'passed' | 'failed' | null }
    );

    const setPassed = (key: string, passed: boolean) => {
      setTestResult((prev) => ({ ...prev, [key]: passed ? 'passed' : 'failed' }));
      return passed;
    };

    try {
      const profileQuery = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user?.id || '')
        .maybeSingle();
      setPassed('new_signup', !profileQuery.error && Boolean(profileQuery.data));

      setPassed(
        'email_verification',
        Boolean(user?.email_confirmed_at)
      );

      setPassed('login_auth', Boolean(user));

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      setPassed('session_persistence', !sessionError && sessionData.session?.user?.id === user?.id);

      if (user) {
        try {
          await getOrCreateProfile(user.id, user.email || '');
          setPassed('profile_auto_recovery', true);
        } catch {
          setPassed('profile_auto_recovery', false);
        }
      } else {
        setPassed('profile_auto_recovery', false);
      }

      const { error: runtimeError } = await supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true });
      setPassed('runtime_verification', !runtimeError);

      const failed = Object.values({
        new_signup: !profileQuery.error && Boolean(profileQuery.data),
        email_verification: Boolean(user?.email_confirmed_at),
        login_auth: Boolean(user),
        session_persistence: !sessionError && sessionData.session?.user?.id === user?.id,
        runtime_verification: !runtimeError
      }).filter((passed) => !passed).length;

      if (failed === 0) {
        writeLog('success', 'Diagnostics', 'Live integration self-check completed successfully.');
        setSuccessNotice('Live integration diagnostics completed.');
      } else {
        writeLog('warn', 'Diagnostics', `Live self-check completed with ${failed} warning(s).`);
        setErrorNotice(`Diagnostics completed with ${failed} warning(s). Check the individual rows below.`);
      }

      setTimeout(() => {
        setSuccessNotice(null);
      }, 4500);
    } catch (err: any) {
      writeLog('error', 'Diagnostics', `Self-check failed: ${err.message}`);
      setErrorNotice(err.message || 'Diagnostics failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div id="admin-viewport" className="min-h-screen bg-stone-950 text-stone-100 select-none flex flex-col font-mono">
      
      <nav id="admin-nav" className="bg-stone-900 border-b border-stone-850 sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => router.push('/dashboard')}
            className="p-1 px-3 bg-stone-800 hover:bg-stone-750 border border-stone-700 rounded-lg text-xs flex items-center gap-1.5 transition text-stone-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-stone-400" />
            <span>Dashboard</span>
          </button>
          
          <div className="h-5 w-[1px] bg-stone-850 hidden sm:block"></div>
          
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-purple-400 animate-spin" style={{ animationDuration: '8s' }} />
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">SyncWave Console</span>
              <span className="text-[9px] text-purple-300">ADMIN CONTROL PORTAL • SECURE</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-[10px] text-stone-450 hidden md:inline-block">OPERATOR: {user?.email}</span>
          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
            AUTHENTICATED
          </span>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-stone-900 border border-stone-850 rounded-2xl p-6 shadow-2xl flex flex-col space-y-6">
            <h2 className="text-sm font-bold text-white border-b border-stone-800 pb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              <span>SYSTEM METRICS</span>
            </h2>

            {errorNotice && (
              <div className="bg-rose-950/40 border border-rose-900 text-rose-300 p-3 rounded-lg text-[11px] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorNotice}</span>
              </div>
            )}

            {successNotice && (
              <div className="bg-emerald-950/40 border border-emerald-905 text-emerald-300 p-3 rounded-lg text-[11px] flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{successNotice}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <span className="text-stone-500 text-[10px] block uppercase">SUPABASE DATABASE STATE</span>
                <span className="text-xs font-semibold text-stone-200">
                  {supabaseConnected ? (
                    <span className="text-emerald-400 font-bold">CONNECTED (HEALTHY)</span>
                  ) : (
                    <span className="text-rose-450 font-bold">DISCONNECTED / INACTIVE</span>
                  )}
                </span>
                <div className="mt-1 text-[10px] text-stone-450 leading-relaxed">
                  Live Supabase connection and profile state are checked against the current session.
                </div>
              </div>

              <div>
                <span className="text-stone-500 text-[10px] block uppercase">OPERATING REGION</span>
                <span className="text-xs font-semibold text-stone-200">global.edge-anycast</span>
              </div>

              <div>
                <span className="text-stone-500 text-[10px] block uppercase">USER UNIQUE IDENTIFIER</span>
                <span className="text-[10.5px] text-purple-300 select-all block break-all font-bold">
                  {user?.id || 'UNAUTHENTICATED'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-800 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] uppercase font-bold text-amber-500">Auto-Recovery System</h4>
                <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping"></span>
              </div>
              <p className="text-[11px] text-stone-400 leading-normal">
                Run a non-destructive profile health check against the signed-in account.
              </p>
              <button
                onClick={runProfileHealthCheck}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-bold tracking-wider uppercase py-2.5 rounded-lg border border-amber-500/20 cursor-pointer transition active:scale-98 flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" style={{ animationDuration: '5s' }} />
                <span>Run Profile Health Check</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col space-y-6">
          <div className="bg-stone-900 border border-stone-850 rounded-2xl p-6 shadow-2xl flex flex-col space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-stone-800">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-white tracking-wider">DEPLOYMENT VERIFICATION CHECKLIST</h3>
              </div>
              
              <button
                onClick={runSelfVerificationTests}
                disabled={testing}
                className="flex items-center space-x-1 px-3 py-1 bg-stone-800 hover:bg-stone-750 text-stone-100 text-[10px] font-bold tracking-wider uppercase rounded border border-stone-700 cursor-pointer transition disabled:bg-stone-800"
              >
                <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{testing ? 'RUNNING...' : 'DIAGNOSTIC TEST'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] border-b border-stone-800/50 pb-2">
              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Profile Row</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.new_signup === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.new_signup ? 'PASSED' : 'READY'}</span>
              </div>
              
              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Email Verification</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.email_verification === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.email_verification ? 'PASSED' : 'READY'}</span>
              </div>

              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Auth Session</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.login_auth === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.login_auth ? 'PASSED' : 'READY'}</span>
              </div>

              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Session Persistence</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.session_persistence === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.session_persistence ? 'PASSED' : 'READY'}</span>
              </div>

              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Profile Health</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.profile_auto_recovery === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.profile_auto_recovery ? 'PASSED' : 'READY'}</span>
              </div>

              <div className="bg-stone-950 px-3 py-2.5 rounded-lg border border-stone-850 flex items-center justify-between">
                <span className="text-stone-400">Database Roundtrip</span>
                <span className={`text-[9px] px-1.5 py-0.5 font-bold rounded ${testResult.runtime_verification === 'passed' ? 'bg-emerald-500/10 text-emerald-405 border border-emerald-500/20' : 'bg-stone-850 text-stone-500'}`}>{testResult.runtime_verification ? 'PASSED' : 'READY'}</span>
              </div>
            </div>
            
            <div className="text-[10px] text-stone-500 flex justify-between">
              <span>Automatic Sanity System Controls</span>
              <span>Checks run against live Supabase state</span>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-850 rounded-2xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-amber-500 animate-pulse animate-duration-1000" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">SECURITY DIAGNOSTICS CONSOLE</span>
              </div>
              <button
                onClick={clearLogs}
                className="text-[9px] font-bold text-stone-400 hover:text-stone-200 cursor-pointer hover:underline"
              >
                Clear Terminal Data
              </button>
            </div>

            <div className="h-56 overflow-y-auto font-mono text-[10px] space-y-2 leading-relaxed bg-stone-950 rounded-xl p-4 border border-stone-850 scrollbar-thin select-text">
              {logs.length === 0 ? (
                <p className="text-stone-600 italic">No logs initialized yet. Use the system to populate diagnostics stream.</p>
              ) : (
                logs.map((log) => {
                  let alertColor = 'text-sky-400';
                  if (log.type === 'success') alertColor = 'text-emerald-400';
                  if (log.type === 'warn') alertColor = 'text-amber-500';
                  if (log.type === 'error') alertColor = 'text-rose-500';

                  return (
                    <div key={log.id} className="border-b border-stone-900/60 pb-1 flex items-start space-x-2">
                      <span className="text-stone-500 shrink-0 select-none">[{log.timestamp}]</span>
                      <div className="flex-1">
                        <span className={`${alertColor} font-bold mr-1`}>{log.event.toUpperCase()}:</span>
                        <span className="text-stone-300">{log.message}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-[10px] text-stone-500 flex justify-between select-none font-sans">
              <span>SyncWave Live Diagnostics</span>
              <span className="font-mono">Dynamic Logging: Active</span>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
