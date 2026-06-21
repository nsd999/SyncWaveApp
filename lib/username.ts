import { getSupabase } from './supabase';

/**
 * Sanitizes an input string to create a safe username prefix based on:
 * - Lowercase
 * - No spaces
 * - No special characters
 * - Truncated initial length to accommodate numeric suffixes under 30 characters limit
 */
export function cleanBaseUsername(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\s+/g, '') // remove spaces
    .replace(/[^a-z0-9]/g, ''); // remove special characters

  const base = cleaned || 'user';
  return base.substring(0, 24); // Limit base to 24 characters to guarantee index fits under 30 chars
}

/**
 * Checks profiles and generates a non-colliding unique username.
 * Attempts up to 50 incremental indexes, e.g. "sai", "sai1", "sai2", "sai3" etc.
 * If fallback occurs, appends a safe random key, ensuring signup never blocks or fails.
 */
export async function generateUniqueUsername(email: string): Promise<string> {
  const emailPrefix = email.split('@')[0] || 'user';
  const baseUsername = cleanBaseUsername(emailPrefix);
  
  const supabase = getSupabase();
  if (!supabase) {
    return baseUsername;
  }

  let attempt = 0;

  while (attempt < 50) {
    const candidate = attempt === 0 ? baseUsername : `${baseUsername}${attempt}`;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', candidate)
        .maybeSingle();

      // If database error, handle safely and proceed to append randomness
      if (error) {
        break;
      }

      if (!data) {
        // No matching user found, username candidate is free!
        return candidate.substring(0, 30);
      }
    } catch (e) {
      break;
    }

    attempt++;
  }

  // Ultimate fallback to ensure database operation NEVER fails
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${baseUsername.substring(0, 25)}${randomSuffix}`.substring(0, 30);
}
