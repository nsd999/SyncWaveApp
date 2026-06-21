'use client';

import * as React from 'react';
import { Database, Copy, Check, Eye, HelpCircle, Key, Cpu, ShieldAlert } from 'lucide-react';

export default function SupabaseSetupNeeded() {
  const [copied, setCopied] = React.useState(false);
  const [sqlCode, setSqlCode] = React.useState<string>('-- Loading complete schema from repository...');

  React.useEffect(() => {
    fetch('/api/db-schema')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.sql) {
          setSqlCode(data.sql);
        }
      })
      .catch((err) => {
        console.error('Failed to load SQL Schema dynamic feed:', err);
        setSqlCode('-- Please see supabase/migrations/schema_and_profiles.sql inside repository root.');
      });
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="setup-root" className="min-h-screen bg-stone-900 text-stone-100 flex items-center justify-center p-4 selection:bg-amber-500/30 selection:text-amber-200">
      <div id="setup-container" className="max-w-2xl w-full bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col space-y-6">
        
        {/* Header Branding */}
        <div id="setup-header" className="flex items-center space-x-3 pb-4 border-b border-stone-800">
          <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 text-amber-500">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-stone-50">SyncWave Foundation</h1>
            <p className="text-xs text-stone-400 font-mono">Phase 1: Real Supabase Integration Required</p>
          </div>
        </div>

        {/* Warning Callout */}
        <div id="setup-warning" className="bg-amber-950/25 border border-amber-500/20 rounded-xl p-4 flex items-start space-x-3 text-amber-200">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-amber-400 mb-1">Durable Storage & Real Integrations Policy</p>
            <p className="text-stone-300">
              This application is built using production-grade standards. We do not use mock databases or simulate authentication. To explore the application, please configure a Supabase project.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div id="setup-steps" className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-stone-400 uppercase">Configuration Checklist</h2>
          
          <div className="grid gap-3 text-xs">
            <div className="flex items-start space-x-3 bg-stone-900/50 p-3 rounded-lg border border-stone-800">
              <span className="flex items-center justify-center w-5 h-5 bg-stone-800 text-stone-300 font-bold font-mono rounded">1</span>
              <div>
                <p className="font-medium text-stone-200">Create a Free Supabase Project</p>
                <p className="text-stone-400 mt-1">Go to <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">supabase.com</a> and sign up for a project with PostgreSQL.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-stone-900/50 p-3 rounded-lg border border-stone-800">
              <span className="flex items-center justify-center w-5 h-5 bg-stone-800 text-stone-300 font-bold font-mono rounded">2</span>
              <div>
                <p className="font-medium text-stone-200">Configure Environment Secrets</p>
                <p className="text-stone-400 mt-1 text-stone-300">
                  Open the <strong className="text-stone-100">Secrets</strong> panel in AI Studio and add:
                </p>
                <div className="mt-2 grid gap-1.5 font-mono text-[11px] bg-stone-950 p-2 rounded border border-stone-800">
                  <div className="flex justify-between">
                    <span className="text-amber-500">NEXT_PUBLIC_SUPABASE_URL</span>
                    <span className="text-stone-400">YOUR_PROJECT_URL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
                    <span className="text-stone-400">YOUR_ANON_KEY</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-stone-900/50 p-3 rounded-lg border border-stone-800">
              <span className="flex items-center justify-center w-5 h-5 bg-stone-800 text-stone-300 font-bold font-mono rounded">3</span>
              <div className="w-full">
                <div className="flex justify-between items-center w-full">
                  <p className="font-medium text-stone-200">Initialize Database Profiles Table</p>
                  <button 
                    onClick={copyToClipboard}
                    className="flex items-center space-x-1.5 text-[11px] font-mono text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition px-2 py-1 rounded border border-amber-500/20 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <p className="text-stone-400 mt-1">Open the <strong className="text-stone-100">SQL Editor</strong> in your Supabase Dashboard, create a new query, paste the code below, and press <strong className="text-stone-100 font-mono">Run</strong>.</p>
                
                <div className="mt-3 relative bg-stone-950 rounded-lg p-3 border border-stone-800 max-h-40 overflow-y-auto font-mono text-[11px] text-stone-300">
                  <pre>{sqlCode}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info/reload */}
        <div id="setup-footer" className="pt-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400 font-mono">
          <div className="flex items-center space-x-1">
            <Database className="w-4 h-4 text-emerald-500" />
            <span>Ready for active binding</span>
          </div>
          <span>Refreshes dynamically</span>
        </div>

      </div>
    </div>
  );
}
