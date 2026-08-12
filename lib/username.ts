import { supabase } from './supabase';

export function cleanBaseUsername(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

  const base = cleaned || 'user';
  return base.substring(0, 24);
}

export async function generateUniqueUsername(email: string): Promise<string> {
  const emailPrefix = email.split('@')[0] || 'user';
  const baseUsername = cleanBaseUsername(emailPrefix);

  let attempt = 0;

  while (attempt < 50) {
    const candidate = attempt === 0 ? baseUsername : `${baseUsername}${attempt}`;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', candidate);

      if (!error && (!data || data.length === 0)) {
        return candidate.substring(0, 30);
      }
    } catch (e) {
      break;
    }

    attempt++;
  }

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${baseUsername.substring(0, 25)}${randomSuffix}`.substring(0, 30);
}
