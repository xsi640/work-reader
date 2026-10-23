import type { Book, ChapterData, ChapterHit } from '../types';

const DB_NAME = 'work-reader';
const DB_VERSION = 2;
const BOOKS = 'books';
const CHAPTERS = 'chapters';
let dbPromise: Promise<IDBDatabase> | null = null;

type LegacyBook = Book & { chapters?: ChapterData[] };
type ChapterRecord = ChapterData & { bookId: string; index: number };

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('数据库事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('数据库事务已取消'));
  });
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) return;

      let bookStore: IDBObjectStore;
      if (db.objectStoreNames.contains(BOOKS)) {
        bookStore = tx.objectStore(BOOKS);
      } else {
        bookStore = db.createObjectStore(BOOKS, { keyPath: 'id' });
      }

      let chapterStore: IDBObjectStore;
      if (db.objectStoreNames.contains(CHAPTERS)) {
        chapterStore = tx.objectStore(CHAPTERS);
      } else {
        chapterStore = db.createObjectStore(CHAPTERS, { keyPath: ['bookId', 'index'] });
        chapterStore.createIndex('byBook', 'bookId');
      }

      // v1 把整本书塞在一个记录里；v2 拆成元数据 + 逐章记录。
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        const cursorReq = bookStore.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const value = cursor.value as LegacyBook;
          if (Array.isArray(value.chapters)) {
            value.chapters.forEach((chapter, index) => {
              chapterStore.put({
                bookId: value.id,
                index,
                title: chapter.title,
                paragraphs: chapter.paragraphs,
              });
            });
            const meta: Book = {
              id: value.id,
              title: value.title,
              author: value.author,
              intro: value.intro,
              chapterCount: value.chapters.length,
              chapterTitles: value.chapters.map((chapter) => chapter.title),
              chars: value.chapters.reduce(
                (sum, chapter) => sum + chapter.paragraphs.join('').length,
                0,
              ),
              createdAt: value.createdAt,
              updatedAt: value.updatedAt,
              source: value.source,
            };
            cursor.update(meta);
          }
          cursor.continue();
        };
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'));
    req.onblocked = () => reject(new Error('数据库正在被其他标签页升级，请关闭其他页面后重试'));
  });
  return dbPromise;
}

async function bookStore(mode: IDBTransactionMode) {
  const db = await openDB();
  return db.transaction(BOOKS, mode).objectStore(BOOKS);
}

export async function getAllBooks(): Promise<Book[]> {
  const store = await bookStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as Book[]);
    req.onerror = () => reject(req.error ?? new Error('读取书库失败'));
  });
}

export async function saveBook(book: Book): Promise<void> {
  const store = await bookStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('保存书籍信息失败'));
  });
}

export async function getChapter(bookId: string, index: number): Promise<ChapterData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(CHAPTERS, 'readonly')
      .objectStore(CHAPTERS)
      .get([bookId, index]);
    req.onsuccess = () => {
      const value = req.result as ChapterRecord | undefined;
      resolve(value ? { title: value.title, paragraphs: value.paragraphs } : null);
    };
    req.onerror = () => reject(req.error ?? new Error('读取章节失败'));
  });
}

export async function saveChapter(
  bookId: string,
  index: number,
  chapter: ChapterData,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(CHAPTERS, 'readwrite')
      .objectStore(CHAPTERS)
      .put({ bookId, index, ...chapter });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('写入章节失败'));
  });
}

export async function saveChapters(
  bookId: string,
  chapters: { index: number; title: string; paragraphs: string[] }[],
): Promise<void> {
  if (!chapters.length) return;
  const db = await openDB();
  const tx = db.transaction(CHAPTERS, 'readwrite');
  const done = txDone(tx);
  const store = tx.objectStore(CHAPTERS);
  for (const chapter of chapters) {
    store.put({ bookId, ...chapter });
  }
  await done;
}

export async function removeBook(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([BOOKS, CHAPTERS], 'readwrite');
  const done = txDone(tx);
  tx.objectStore(BOOKS).delete(id);
  const chapters = tx.objectStore(CHAPTERS);
  const cursorReq = chapters.index('byBook').openKeyCursor(IDBKeyRange.only(id));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    chapters.delete(cursor.primaryKey);
    cursor.continue();
  };
  await done;
}

export async function clearBooks(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([BOOKS, CHAPTERS], 'readwrite');
  const done = txDone(tx);
  tx.objectStore(BOOKS).clear();
  tx.objectStore(CHAPTERS).clear();
  await done;
}

/**
 * 逐章扫描，不把整本书读进内存。命中 limit 条即停止。
 */
export async function searchChapters(
  bookId: string,
  query: string,
  limit = 40,
  signal?: AbortSignal,
): Promise<ChapterHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const db = await openDB();
  const tx = db.transaction(CHAPTERS, 'readonly');
  const index = tx.objectStore(CHAPTERS).index('byBook');
  const hits: ChapterHit[] = [];

  return new Promise((resolve, reject) => {
    const req = index.openCursor(IDBKeyRange.only(bookId));
    req.onerror = () => reject(req.error ?? new Error('搜索失败'));
    req.onsuccess = () => {
      if (signal?.aborted) {
        resolve(hits);
        return;
      }
      const cursor = req.result;
      if (!cursor || hits.length >= limit) {
        resolve(hits);
        return;
      }
      const record = cursor.value as ChapterRecord;
      for (const paragraph of record.paragraphs) {
        const at = paragraph.toLowerCase().indexOf(needle);
        if (at === -1) continue;
        const start = Math.max(0, at - 24);
        const end = Math.min(paragraph.length, at + needle.length + 34);
        hits.push({
          chapter: record.index,
          snippet:
            (start > 0 ? '…' : '') +
            paragraph.slice(start, end) +
            (end < paragraph.length ? '…' : ''),
        });
        if (hits.length >= limit) break;
      }
      cursor.continue();
    };
  });
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
