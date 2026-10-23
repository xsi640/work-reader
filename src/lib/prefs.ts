import type { Book, ChapterHit, Settings } from '../types';

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

export function searchBook(book: Book, query: string): ChapterHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: ChapterHit[] = [];
  book.chapters.forEach((chapter, index) => {
    for (const paragraph of chapter.paragraphs) {
      const at = paragraph.toLowerCase().indexOf(q);
      if (at === -1) continue;
      const start = Math.max(0, at - 24);
      const end = Math.min(paragraph.length, at + q.length + 34);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < paragraph.length ? '…' : '';
      hits.push({ chapter: index, snippet: prefix + paragraph.slice(start, end) + suffix });
      if (hits.length >= 40) return;
    }
  });
  return hits;
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

const HEADING_RE =
  /^(?:第[〇零一二三四五六七八九十百千两0-9]+[章回节卷部篇集][^\n]{0,40}|序章[^\n]{0,30}|楔子[^\n]{0,30}|尾声[^\n]{0,30}|终章[^\n]{0,30}|Chapter\s+\d+[^\n]{0,60})$/i;

function toParagraphs(lines: string[]): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length) {
        blocks.push(current.join(''));
        current = [];
      }
    } else {
      current.push(trimmed);
    }
  }
  if (current.length) blocks.push(current.join(''));

  const nonEmpty = lines.filter((l) => l.trim()).length;
  if (blocks.length === 1 && nonEmpty > 2) {
    return lines.map((l) => l.trim()).filter(Boolean);
  }
  return blocks.filter(Boolean);
}

export function parseTxt(filename: string, raw: string): Book {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  const headingIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (HEADING_RE.test(line.trim())) headingIndexes.push(i);
  });

  const chapters: { title: string; paragraphs: string[] }[] = [];

  if (headingIndexes.length) {
    const preface = lines.slice(0, headingIndexes[0]);
    const prefaceParas = toParagraphs(preface);
    if (prefaceParas.length && prefaceParas.join('').length >= 80) {
      chapters.push({ title: '序', paragraphs: prefaceParas });
    }
    headingIndexes.forEach((start, i) => {
      const end = headingIndexes[i + 1] ?? lines.length;
      const title = lines[start].trim();
      const paras = toParagraphs(lines.slice(start + 1, end));
      if (paras.length) chapters.push({ title, paragraphs: paras });
    });
  } else {
    const paras = toParagraphs(lines);
    if (paras.length) {
      const chunkSize = 2400;
      let bucket: string[] = [];
      let size = 0;
      let index = 1;
      const flush = () => {
        if (!bucket.length) return;
        chapters.push({ title: `第 ${index} 章`, paragraphs: bucket });
        index += 1;
        bucket = [];
        size = 0;
      };
      for (const p of paras) {
        bucket.push(p);
        size += p.length;
        if (size >= chunkSize) flush();
      }
      flush();
    }
  }

  return {
    id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: filename.replace(/\.txt$/i, '').replace(/^《|》$/g, '').trim() || '未命名',
    author: '本地导入',
    chapters,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: 'import',
  };
}
