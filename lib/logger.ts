export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  event: string;
  message: string;
}

/**
 * Global application and auth logger.
 * Writes formatted statements both to browser DevTools and localStorage.
 * Fires local events to dynamically update visual diagnostic panels.
 */
export function writeLog(type: LogEntry['type'], event: string, message: string) {
  if (typeof window === 'undefined') {
    console.log(`[SyncWave] [${type.toUpperCase()}] ${event}: ${message}`);
    return;
  }

  try {
    const raw = localStorage.getItem('syncwave-diagnostic-logs') || '[]';
    const logs: LogEntry[] = JSON.parse(raw);
    
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(3, 9),
      timestamp: new Date().toISOString().substring(11, 19),
      type,
      event,
      message,
    };
    
    // Append at the front
    logs.unshift(newEntry);
    
    // Keep a maximum of 60 logs
    localStorage.setItem('syncwave-diagnostic-logs', JSON.stringify(logs.slice(0, 60)));
    
    // Broadcast event for active UI subscribers
    window.dispatchEvent(new CustomEvent('syncwave-new-log', { detail: newEntry }));
  } catch (e) {
    // Suppress storage block errors
  }

  console.log(`[SyncWave] [${type.toUpperCase()}] ${event}: ${message}`);
}

export function getLogs(): LogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('syncwave-diagnostic-logs') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function clearLogs() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('syncwave-diagnostic-logs', '[]');
  window.dispatchEvent(new CustomEvent('syncwave-new-log'));
}
export function getDiagnosticsReport() {
  // A browser-side helper cannot independently certify that CI, TypeScript, or
  // server runtime checks passed. Report only facts this runtime can observe.
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    )
  );

  return {
    buildCheck: "not_verified_in_browser",
    typeCheck: "not_verified_in_browser",
    runtimeCheck: "not_verified_in_browser",
    supabaseConfig: configured ? "configured" : "missing_environment_variables",
    authClient: "not_checked_by_browser_diagnostics"
  };
}
