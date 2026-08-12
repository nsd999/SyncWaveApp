import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

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
      const q = query(collection(db, 'profiles'), where('username', '==', candidate));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
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
