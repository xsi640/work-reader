import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Composer } from './components/Composer';
import { ReaderControls } from './components/Controls';
import { Mark } from './components/Logo';
import { Popover } from './components/Menu';
import {
  AboutModal,
  ConfirmModal,
  ImportOverlay,
  LibraryModal,
  RenameModal,
  SearchModal,
  SettingsModal,
  TocModal,
} from './components/Modals';
import { Sidebar } from './components/Sidebar';
import { EmptyState, Thread } from './components/Thread';
import { Topbar } from './components/Topbar';
import {
  clearBooks,
  estimateStorage,
  getAllBooks,
  getChapter,
  removeBook,
  saveBook,
  searchChapters,
} from './lib/db';
import { ImportTooLargeError, MAX_IMPORT_BYTES, importTxtFile } from './lib/importer';
import { seedDemoBooks } from './lib/seed';
import {
  cnToNumber,
  loadBookmarks,
  loadLastBook,
  loadProgress,
  loadSettings,
  saveBookmarks,
  saveLastBook,
  saveProgress,
  saveSettings,
} from './lib/prefs';
import type { Book, Msg, Settings } from './types';

const MOBILE_QUERY = '(max-width: 900px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** 内存里最多保留最近 8 章正文，旧章节只留在 IndexedDB。 */
const MAX_THREAD_CHAPTERS = 8;

function pruneChapters(list: Msg[]): Msg[] {
  let seen = 0;
  const kept: Msg[] = [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const msg = list[index];
    if (msg.role === 'assistant' && msg.kind === 'chapter') {
      seen += 1;
      if (seen > MAX_THREAD_CHAPTERS) continue;
    }
    kept.push(msg);
  }
  return kept.reverse();
}

type ModalState =
  | { type: 'search' }
  | { type: 'toc' }
  | { type: 'library' }
  | { type: 'settings' }
  | { type: 'about' }
  | { type: 'rename'; bookId: string }
  | { type: 'delete'; bookId: string }
  | { type: 'clear' }
  | null;

export default function App() {
  const isMobile = useIsMobile();
  const [books, setBooks] = useState<Book[]>([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>(loadProgress);
  const [bookmarks, setBookmarks] = useState<Record<string, number[]>>(loadBookmarks);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia(MOBILE_QUERY).matches,
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [importJob, setImportJob] = useState<{
    name: string;
    loaded: number;
    total: number;
    chapters: number;
  } | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const loadTokenRef = useRef(0);
  const latestSearchRef = useRef<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const booksRef = useRef(books);
  const activeIdRef = useRef(activeId);
  const progressRef = useRef(progress);
  const bookmarksRef = useRef(bookmarks);

  booksRef.current = books;
  activeIdRef.current = activeId;
  progressRef.current = progress;
  bookmarksRef.current = bookmarks;

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeId) ?? null,
    [books, activeId],
  );
  const currentChapter = activeBook ? progress[activeBook.id] ?? 0 : 0;
  const bookmarked = activeBook
    ? (bookmarks[activeBook.id] ?? []).includes(currentChapter)
    : false;

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      importAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await getAllBooks();
        const seeded = localStorage.getItem('work-reader:seeded') === '1';
        if (!list.length && !seeded) {
          list = await seedDemoBooks();
          localStorage.setItem('work-reader:seeded', '1');
        }
        if (!cancelled) {
          setBooks([...list].sort((a, b) => b.updatedAt - a.updatedAt));
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setReady(true);
          showToast('无法读取本地书库，请检查浏览器设置');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!importJob) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [importJob]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--reader-size', `${settings.fontSize}px`);
    style.setProperty('--reader-leading', String(settings.leading));
    style.setProperty('--reader-font', settings.serif ? 'var(--font-serif)' : 'var(--font-ui)');
  }, [settings.fontSize, settings.leading, settings.serif]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
    else setSidebarOpen(localStorage.getItem('work-reader:sidebar') !== '0');
  }, [isMobile]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const refreshStorage = useCallback(async () => {
    const estimate = await estimateStorage();
    setStorage(estimate);
  }, []);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, []);

  const handleStreamEnd = useCallback((id: string) => {
    setStreamingId((current) => (current === id ? null : current));
  }, []);

  const scrollToMessage = useCallback((id: string) => {
    requestAnimationFrame(() => {
      document
        .getElementById(`msg-${id}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      if (!isMobile) localStorage.setItem('work-reader:sidebar', next ? '1' : '0');
      return next;
    });
  }, [isMobile]);

  const markProgress = useCallback((bookId: string, chapter: number) => {
    const next = { ...progressRef.current, [bookId]: chapter };
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  const touchBook = useCallback((bookId: string) => {
    setBooks((prev) => {
      const target = prev.find((book) => book.id === bookId);
      if (!target) return prev;
      const updated = { ...target, updatedAt: Date.now() };
      void saveBook(updated);
      return [updated, ...prev.filter((book) => book.id !== bookId)];
    });
  }, []);

  const openBook = useCallback(
    async (id: string, chapter?: number, opts?: { userText?: string }) => {
      const book = booksRef.current.find((item) => item.id === id);
      if (!book || !book.chapterCount) {
        showToast('这本书还没有可读的章节');
        return;
      }

      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      latestSearchRef.current = null;
      const token = ++loadTokenRef.current;
      stopSpeech();
      setModal(null);
      setPanel(null);
      if (isMobile) setSidebarOpen(false);

      const index = clamp(chapter ?? progressRef.current[id] ?? 0, 0, book.chapterCount - 1);
      const data = await getChapter(id, index);
      if (token !== loadTokenRef.current) return;

      if (!data) {
        showToast('章节读取失败，请重试');
        return;
      }

      const messageId = uid();
      const initial: Msg[] = opts?.userText
        ? [{ id: uid(), role: 'user', text: opts.userText }]
        : [];

      activeIdRef.current = id;
      setActiveId(id);
      setMessages([
        ...initial,
        {
          id: messageId,
          role: 'assistant',
          kind: 'chapter',
          bookId: id,
          chapter: index,
          data,
        },
      ]);
      setStreamingId(messageId);
      markProgress(id, index);
      saveLastBook(id);
      touchBook(id);
      requestAnimationFrame(() => scrollerRef.current?.scrollTo({ top: 0 }));
    },
    [isMobile, markProgress, showToast, stopSpeech, touchBook],
  );

  const pushText = useCallback(
    (text: string) => {
      const id = uid();
      setMessages((prev) => [...prev, { id, role: 'assistant', kind: 'text', text }]);
      scrollToMessage(id);
    },
    [scrollToMessage],
  );

  const goToChapter = useCallback(
    async (index: number) => {
      const book = booksRef.current.find((item) => item.id === activeIdRef.current);
      if (!book) return;
      if (index < 0) {
        pushText('已经是第一章了。');
        return;
      }
      if (index >= book.chapterCount) {
        pushText(`已经读到最后一章了。《${book.title}》共 ${book.chapterCount} 章。`);
        return;
      }

      const token = ++loadTokenRef.current;
      stopSpeech();
      const data = await getChapter(book.id, index);
      if (token !== loadTokenRef.current || activeIdRef.current !== book.id) return;
      if (!data) {
        pushText('这一章读取失败，请重试。');
        return;
      }

      const messageId = uid();
      setMessages((prev) =>
        pruneChapters([
          ...prev,
          {
            id: messageId,
            role: 'assistant',
            kind: 'chapter',
            bookId: book.id,
            chapter: index,
            data,
          },
        ]),
      );
      setStreamingId(messageId);
      markProgress(book.id, index);
      touchBook(book.id);
      scrollToMessage(messageId);
    },
    [markProgress, pushText, scrollToMessage, stopSpeech, touchBook],
  );

  const pushToc = useCallback(() => {
    const book = booksRef.current.find((item) => item.id === activeIdRef.current);
    if (!book) return;
    const id = uid();
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', kind: 'toc', bookId: book.id },
    ]);
    scrollToMessage(id);
  }, [scrollToMessage]);

  const toggleBookmark = useCallback(
    (bookId: string, chapter: number) => {
      const current = bookmarksRef.current[bookId] ?? [];
      const has = current.includes(chapter);
      const list = has
        ? current.filter((value) => value !== chapter)
        : [...current, chapter].sort((a, b) => a - b);
      const next = { ...bookmarksRef.current, [bookId]: list };
      bookmarksRef.current = next;
      setBookmarks(next);
      saveBookmarks(next);
      const book = booksRef.current.find((item) => item.id === bookId);
      showToast(
        has
          ? `已移除第 ${chapter + 1} 章的书签`
          : `已为第 ${chapter + 1} 章添加书签${book ? ` · ${book.title}` : ''}`,
      );
    },
    [showToast],
  );

  const speak = useCallback(
    (id: string, text: string) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        showToast('当前浏览器不支持朗读');
        return;
      }
      if (speakingId === id) {
        synth.cancel();
        setSpeakingId(null);
        return;
      }
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1;
      const voice = synth.getVoices().find((item) => item.lang?.toLowerCase().startsWith('zh'));
      if (voice) utterance.voice = voice;
      utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onerror = () => setSpeakingId((current) => (current === id ? null : current));
      synth.speak(utterance);
      setSpeakingId(id);
    },
    [showToast, speakingId],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setStreamingId(null);
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      latestSearchRef.current = null;
      const book = booksRef.current.find((item) => item.id === activeIdRef.current) ?? null;

      if (!book) {
        const needle = text.replace(/[《》「」\s]/g, '');
        const matched = booksRef.current.find((item) => {
          const title = item.title.replace(/\s/g, '');
          return title === needle || needle.includes(title) || title.includes(needle);
        });
        if (matched) {
          void openBook(matched.id, 0, { userText: text });
          return;
        }
        setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
        pushText('书库里没有找到这本书。你可以点左侧「书库」挑一本，或把 TXT 文件拖进来导入。');
        return;
      }

      setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
      const current = progressRef.current[book.id] ?? 0;
      const compact = text.toLowerCase().replace(/\s+/g, '');

      if (/^(下一章|下章|继续|继续读|继续阅读|next)/.test(compact)) {
        void goToChapter(current + 1);
        return;
      }
      if (/^(上一章|上章|prev)/.test(compact)) {
        void goToChapter(current - 1);
        return;
      }
      if (/^(目录|章节|toc|contents)/.test(compact)) {
        pushToc();
        return;
      }
      if (/^(书签|加入书签|bookmark)/.test(compact)) {
        toggleBookmark(book.id, current);
        return;
      }
      if (/^(从头|开头|重新开始|重新读)/.test(compact)) {
        void goToChapter(0);
        return;
      }

      const chapterMatch = text.match(/^第\s*([0-9]+|[〇零一二两三四五六七八九十百千]+)\s*[章回节]/);
      if (chapterMatch) {
        const n = cnToNumber(chapterMatch[1]);
        if (n && n >= 1) {
          void goToChapter(n - 1);
          return;
        }
      }
      if (/^\d+$/.test(text)) {
        void goToChapter(Number(text) - 1);
        return;
      }

      const searchMatch = text.match(/^(?:搜索|查找|找|search)\s*[:：]?\s*(.+)$/i);
      const query = searchMatch ? searchMatch[1].trim() : text;
      if (!query) {
        pushText('想找什么？把关键词发给我就行。');
        return;
      }

      const searchId = uid();
      const searchController = new AbortController();
      searchAbortRef.current = searchController;
      latestSearchRef.current = searchId;
      setMessages((prev) => [
        ...prev,
        {
          id: searchId,
          role: 'assistant',
          kind: 'text',
          text: `正在书中查找「${query}」…`,
        },
      ]);
      scrollToMessage(searchId);

      try {
        const hits = await searchChapters(book.id, query, 40, searchController.signal);
        if (latestSearchRef.current !== searchId || activeIdRef.current !== book.id) {
          setMessages((prev) => prev.filter((msg) => msg.id !== searchId));
          return;
        }
        const next: Msg = hits.length
          ? { id: searchId, role: 'assistant', kind: 'hits', bookId: book.id, query, hits }
          : {
              id: searchId,
              role: 'assistant',
              kind: 'text',
              text: `没有在《${book.title}》里找到「${query}」。可以换个更短的词，或者输入「目录」翻一翻。`,
            };
        setMessages((prev) => prev.map((msg) => (msg.id === searchId ? next : msg)));
      } catch {
        if (latestSearchRef.current === searchId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === searchId
                ? { id: searchId, role: 'assistant', kind: 'text', text: '搜索失败，请重试。' }
                : msg,
            ),
          );
        }
      } finally {
        if (searchAbortRef.current === searchController) searchAbortRef.current = null;
      }
    },
    [goToChapter, openBook, pushText, pushToc, scrollToMessage, toggleBookmark],
  );

  const continueReading = useCallback(() => {
    const last = loadLastBook();
    const lastBook = last ? booksRef.current.find((book) => book.id === last) : undefined;
    const book =
      lastBook ?? [...booksRef.current].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!book) {
      setModal({ type: 'library' });
      return;
    }
    void openBook(book.id, progressRef.current[book.id] ?? 0);
  }, [openBook]);

  const randomRead = useCallback(() => {
    const list = booksRef.current.filter((book) => book.chapterCount > 0);
    if (!list.length) {
      setModal({ type: 'library' });
      return;
    }
    const book = list[Math.floor(Math.random() * list.length)];
    void openBook(book.id, Math.floor(Math.random() * book.chapterCount));
  }, [openBook]);

  const newChat = useCallback(() => {
    stopSpeech();
    loadTokenRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    latestSearchRef.current = null;
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
    setStreamingId(null);
    setModal(null);
    if (isMobile) setSidebarOpen(false);
    requestAnimationFrame(() => scrollerRef.current?.scrollTo({ top: 0 }));
  }, [isMobile, stopSpeech]);

  const importFile = useCallback(
    async (file: File) => {
      if (!/\.txt$/i.test(file.name)) {
        showToast('目前只支持 TXT 文件');
        return;
      }
      if (file.size > MAX_IMPORT_BYTES) {
        showToast(
          `文件超过 ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB 上限，建议先按卷拆分`,
        );
        return;
      }
      if (importAbortRef.current) {
        showToast('已有一个导入任务在进行');
        return;
      }

      const controller = new AbortController();
      importAbortRef.current = controller;
      setImportJob({ name: file.name, loaded: 0, total: file.size, chapters: 0 });

      try {
        const estimate = await estimateStorage();
        if (
          estimate &&
          estimate.quota > 0 &&
          estimate.quota - estimate.usage < file.size * 1.2
        ) {
          showToast('本地存储空间不足，请先清理书库');
          return;
        }
        void navigator.storage?.persist?.();

        const book = await importTxtFile(
          file,
          (progress) => setImportJob({ name: file.name, ...progress }),
          controller.signal,
        );
        const next = [book, ...booksRef.current.filter((item) => item.id !== book.id)];
        booksRef.current = next;
        setBooks(next);
        void refreshStorage();
        showToast(`已导入《${book.title}》· 共 ${book.chapterCount} 章`);
        await openBook(book.id, 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          showToast('已取消导入');
        } else if (error instanceof ImportTooLargeError) {
          showToast(error.message);
        } else {
          showToast(error instanceof Error ? error.message : '导入失败，请检查文件编码');
        }
      } finally {
        importAbortRef.current = null;
        setImportJob(null);
      }
    },
    [openBook, refreshStorage, showToast],
  );

  const deleteBook = useCallback(
    async (id: string) => {
      try {
        await removeBook(id);
      } catch {
        /* 忽略存储错误，本地状态仍需同步 */
      }
      const next = booksRef.current.filter((book) => book.id !== id);
      booksRef.current = next;
      setBooks(next);

      const nextProgress = { ...progressRef.current };
      delete nextProgress[id];
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      saveProgress(nextProgress);

      const nextMarks = { ...bookmarksRef.current };
      delete nextMarks[id];
      bookmarksRef.current = nextMarks;
      setBookmarks(nextMarks);
      saveBookmarks(nextMarks);

      if (activeIdRef.current === id) {
        loadTokenRef.current += 1;
        searchAbortRef.current?.abort();
        searchAbortRef.current = null;
        latestSearchRef.current = null;
        stopSpeech();
        activeIdRef.current = null;
        setActiveId(null);
        setMessages([]);
        setStreamingId(null);
      }
      if (loadLastBook() === id) {
        try {
          localStorage.removeItem('work-reader:last');
        } catch {
          /* ignore */
        }
      }
      void refreshStorage();
      setModal(null);
      showToast('已删除');
    },
    [refreshStorage, showToast, stopSpeech],
  );

  const renameBook = useCallback(
    async (id: string, title: string) => {
      const target = booksRef.current.find((book) => book.id === id);
      if (!target) {
        setModal(null);
        return;
      }
      const updated = { ...target, title };
      const next = booksRef.current.map((book) => (book.id === id ? updated : book));
      booksRef.current = next;
      setBooks(next);
      try {
        await saveBook(updated);
      } catch {
        /* ignore */
      }
      setModal(null);
      showToast('已重命名');
    },
    [showToast],
  );

  const restoreDemo = useCallback(async () => {
    const demos = await seedDemoBooks(true);
    const ids = new Set(demos.map((book) => book.id));
    const next = [...demos, ...booksRef.current.filter((book) => !ids.has(book.id))];
    booksRef.current = next;
    setBooks(next);
    void refreshStorage();
    setModal(null);
    showToast('已载入示例书籍');
  }, [refreshStorage, showToast]);

  const resetProgress = useCallback(() => {
    progressRef.current = {};
    setProgress({});
    saveProgress({});
    showToast('阅读进度已重置');
  }, [showToast]);

  const clearAll = useCallback(async () => {
    await clearBooks();
    stopSpeech();
    loadTokenRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    latestSearchRef.current = null;
    booksRef.current = [];
    progressRef.current = {};
    bookmarksRef.current = {};
    activeIdRef.current = null;
    setBooks([]);
    setProgress({});
    setBookmarks({});
    setActiveId(null);
    setMessages([]);
    setStreamingId(null);
    saveProgress({});
    saveBookmarks({});
    try {
      localStorage.removeItem('work-reader:last');
    } catch {
      /* ignore */
    }
    void refreshStorage();
    setModal(null);
    showToast('已删除所有书籍');
  }, [refreshStorage, showToast, stopSpeech]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPanel(null);
        setModal({ type: 'search' });
        return;
      }
      if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        const id = activeIdRef.current;
        if (!id) return;
        event.preventDefault();
        const chapter = progressRef.current[id] ?? 0;
        goToChapter(chapter + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToChapter]);

  const openFilePicker = () => fileRef.current?.click();

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      setDropActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  const openSettings = () => {
    void refreshStorage();
    setModal({ type: 'settings' });
  };

  const renameTarget =
    modal?.type === 'rename' ? books.find((book) => book.id === modal.bookId) ?? null : null;
  const deleteTarget =
    modal?.type === 'delete' ? books.find((book) => book.id === modal.bookId) ?? null : null;

  if (!ready) {
    return (
      <div className="boot">
        <Mark size={30} />
        <span>正在打开书库…</span>
      </div>
    );
  }

  return (
    <div
      className={`app${sidebarOpen ? ' sidebar-open' : ''}${dropActive ? ' drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isMobile && sidebarOpen ? (
        <div className="scrim" onMouseDown={() => setSidebarOpen(false)} />
      ) : null}

      <Sidebar
        books={books}
        activeId={activeId}
        progress={progress}
        onCollapse={toggleSidebar}
        onNew={newChat}
        onSearch={() => setModal({ type: 'search' })}
        onLibrary={() => setModal({ type: 'library' })}
        onOpenBook={(id) => void openBook(id)}
        onRename={(id) => setModal({ type: 'rename', bookId: id })}
        onDelete={(id) => setModal({ type: 'delete', bookId: id })}
        onSettings={openSettings}
      />

      <div className="main">
        <Topbar
          activeBook={activeBook}
          books={books}
          progress={progress}
          sidebarVisible={sidebarOpen}
          isMobile={isMobile}
          bookmarked={bookmarked}
          onToggleSidebar={toggleSidebar}
          onOpenBook={(id) => void openBook(id)}
          onLibrary={() => setModal({ type: 'library' })}
          onImport={openFilePicker}
          onToggleBookmark={() => {
            if (activeBook) toggleBookmark(activeBook.id, currentChapter);
          }}
          onOpenReaderPanel={(rect) =>
            setPanel((prev) =>
              prev ? null : { x: rect.right, y: rect.bottom + 8 },
            )
          }
          onOpenSettings={openSettings}
          onAbout={() => setModal({ type: 'about' })}
        />

        <div className="scroller" ref={scrollerRef}>
          {activeBook ? (
            <Thread
              messages={messages}
              books={books}
              progress={progress}
              bookmarks={bookmarks}
              streamingId={streamingId}
              speakingId={speakingId}
              width={settings.width}
              onStreamEnd={handleStreamEnd}
              onNavigate={(chapter) => void goToChapter(chapter)}
              onOpenToc={() => setModal({ type: 'toc' })}
              onToggleBookmark={toggleBookmark}
              onSpeak={speak}
              showToast={showToast}
            />
          ) : (
            <EmptyState
              books={books}
              progress={progress}
              onContinue={continueReading}
              onRandom={randomRead}
              onLibrary={() => setModal({ type: 'library' })}
              onImport={openFilePicker}
            />
          )}
        </div>

        <Composer
          hasBook={!!activeBook}
          streaming={streamingId !== null}
          onSend={send}
          onStop={() => setStreamingId(null)}
          onToc={() => setModal({ type: 'toc' })}
          onImport={openFilePicker}
        />
      </div>

      {modal?.type === 'search' ? (
        <SearchModal
          books={books}
          progress={progress}
          onClose={() => setModal(null)}
          onOpenBook={(id, chapter) => void openBook(id, chapter)}
        />
      ) : null}

      {modal?.type === 'toc' && activeBook ? (
        <TocModal
          book={activeBook}
          progress={currentChapter}
          bookmarks={bookmarks[activeBook.id] ?? []}
          onClose={() => setModal(null)}
          onOpenChapter={(chapter) => {
            setModal(null);
            void goToChapter(chapter);
          }}
        />
      ) : null}

      {modal?.type === 'library' ? (
        <LibraryModal
          books={books}
          progress={progress}
          onClose={() => setModal(null)}
          onOpenBook={(id) => void openBook(id)}
          onImport={() => {
            setModal(null);
            openFilePicker();
          }}
          onDelete={(id) => setModal({ type: 'delete', bookId: id })}
          onRestoreDemo={() => void restoreDemo()}
        />
      ) : null}

      {modal?.type === 'settings' ? (
        <SettingsModal
          settings={settings}
          storage={storage}
          library={{
            books: books.length,
            chars: books.reduce((sum, book) => sum + book.chars, 0),
          }}
          onChange={updateSettings}
          onClose={() => setModal(null)}
          onResetProgress={resetProgress}
          onClearBooks={() => setModal({ type: 'clear' })}
        />
      ) : null}

      {modal?.type === 'about' ? <AboutModal onClose={() => setModal(null)} /> : null}

      {modal?.type === 'rename' && renameTarget ? (
        <RenameModal
          book={renameTarget}
          onClose={() => setModal(null)}
          onConfirm={(title) => void renameBook(renameTarget.id, title)}
        />
      ) : null}

      {modal?.type === 'delete' && deleteTarget ? (
        <ConfirmModal
          title="删除这本书？"
          message={`《${deleteTarget.title}》及其阅读进度、书签会从本机移除，此操作无法撤销。`}
          onClose={() => setModal(null)}
          onConfirm={() => void deleteBook(deleteTarget.id)}
        />
      ) : null}

      {modal?.type === 'clear' ? (
        <ConfirmModal
          title="删除所有书籍？"
          message={`共 ${books.length} 本书会被移除，阅读进度和书签也会一并清空。`}
          onClose={() => setModal(null)}
          onConfirm={() => void clearAll()}
        />
      ) : null}

      {panel ? (
        <Popover
          x={panel.x}
          y={panel.y}
          width={292}
          align="right"
          onClose={() => setPanel(null)}
        >
          <ReaderControls settings={settings} onChange={updateSettings} />
        </Popover>
      ) : null}

      {importJob ? (
        <ImportOverlay
          name={importJob.name}
          loaded={importJob.loaded}
          total={importJob.total}
          chapters={importJob.chapters}
          onCancel={() => importAbortRef.current?.abort()}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      {dropActive ? (
        <div className="drop-overlay">
          <div className="drop-card">
            <Mark size={28} />
            <span>松手导入 TXT</span>
          </div>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
