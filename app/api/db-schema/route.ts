import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    // Attempt to read the schema file from the standard workspace path
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', 'schema_and_profiles.sql');
    const content = await fs.readFile(filePath, 'utf-8');
    
    return NextResponse.json({ sql: content });
  } catch (error: any) {
    console.error('[SyncWave API] Failed to read database schema file:', error.message);
    
    // Resilient fallback with the actual core schema content if file reading fails
    const fallbackSql = `-- SYNCWAVE FALLBACK DATABASE SCHEMA SCRIPTS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);`;
    return NextResponse.json({ sql: fallbackSql, isFallback: true });
  }
}
