import type { Settings } from '../types';

const SETTINGS_KEY = 'work-reader:settings';
const PROGRESS_KEY = 'work-reader:progress';
const BOOKMARKS_KEY = 'work-reader:bookmarks';
const LAST_KEY = 'work-reader:last';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 16,
  leading: 1.75,
  serif: false,
  width: 'standard',
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 本地存储不可用时静默降级 */
  }
}

export function loadSettings(): Settings {
  const saved = readJSON<Partial<Settings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: Settings): void {
  writeJSON(SETTINGS_KEY, settings);
}

export function loadProgress(): Record<string, number> {
  return readJSON<Record<string, number>>(PROGRESS_KEY, {});
}

export function saveProgress(progress: Record<string, number>): void {
  writeJSON(PROGRESS_KEY, progress);
}

export function loadBookmarks(): Record<string, number[]> {
  return readJSON<Record<string, number[]>>(BOOKMARKS_KEY, {});
}

export function saveBookmarks(bookmarks: Record<string, number[]>): void {
  writeJSON(BOOKMARKS_KEY, bookmarks);
}

export function loadLastBook(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function saveLastBook(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}

export function cnToNumber(input: string): number | null {
  if (/^\d+$/.test(input)) return Number(input);
  const digits: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let section = 0;
  let num = 0;
  let seen = false;
  for (const ch of input) {
    if (ch in digits) {
      num = digits[ch];
      seen = true;
    } else if (ch in units) {
      if (num === 0) num = 1;
      section += num * units[ch];
      num = 0;
      seen = true;
    } else if (ch === '万') {
      total += (section + num) * 10000;
      section = 0;
      num = 0;
      seen = true;
    } else {
      return null;
    }
  }
  if (!seen) return null;
  return total + section + num;
}
