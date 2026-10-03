import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'checklist.completion.';

/** The local calendar day as YYYY-MM-DD, so the list resets at local midnight. */
export function dayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function storageKeyFor(day: string): string {
  return `${PREFIX}${day}`;
}

/** The ids of the tasks done on `day`. A missing or unreadable entry is an empty list. */
export async function loadCompletion(day: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(storageKeyFor(day));
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function saveCompletion(day: string, doneIds: Iterable<string>): Promise<void> {
  await AsyncStorage.setItem(storageKeyFor(day), JSON.stringify([...doneIds]));
}
