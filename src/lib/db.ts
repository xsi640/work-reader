import type { Book } from '../types';

const DB_NAME = 'work-reader';
const STORE = 'books';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'));
  });
  return dbPromise;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getAllBooks(): Promise<Book[]> {
  const s = await store('readonly');
  return new Promise((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result as Book[]);
    req.onerror = () => reject(req.error ?? new Error('读取书库失败'));
  });
}

export async function saveBook(book: Book): Promise<void> {
  const s = await store('readwrite');
  return new Promise((resolve, reject) => {
    const req = s.put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('保存失败'));
  });
}

export async function removeBook(id: string): Promise<void> {
  const s = await store('readwrite');
  return new Promise((resolve, reject) => {
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('删除失败'));
  });
}

export async function clearBooks(): Promise<void> {
  const s = await store('readwrite');
  return new Promise((resolve, reject) => {
    const req = s.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('清空失败'));
  });
}
