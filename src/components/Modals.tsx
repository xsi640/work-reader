import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  BookOpen,
  Library as LibraryIcon,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Book, Settings } from '../types';
import { searchChapters } from '../lib/db';
import { formatBytes, formatChars } from '../lib/format';
import { ReaderControls } from './Controls';
import { Highlight } from './Highlight';
import { Mark } from './Logo';
import { coverClass } from './Topbar';

function ModalShell({
  children,
  onClose,
  className = '',
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function SearchModal({
  books,
  progress,
  onClose,
  onOpenBook,
}: {
  books: Book[];
  progress: Record<string, number>;
  onClose: () => void;
  onOpenBook: (bookId: string, chapter: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<
    { book: Book; chapter: number; snippet: string }[]
  >([]);
  const [searching, setSearching] = useState(false);

  const recent = useMemo(
    () => [...books].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [books],
  );

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const found: { book: Book; chapter: number; snippet: string }[] = [];
      try {
        for (const book of books) {
          if (controller.signal.aborted) return;
          const hits = await searchChapters(book.id, q, 6, controller.signal);
          for (const hit of hits) found.push({ book, ...hit });
          if (found.length >= 30) break;
        }
        if (!controller.signal.aborted) setResults(found);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [books, query]);

  return (
    <ModalShell onClose={onClose} className="modal-search">
      <div className="search-head">
        <Search size={18} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索书库与章节"
          aria-label="搜索书库与章节"
        />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="modal-scroll">
        {query.trim() ? (
          searching ? (
            <div className="modal-empty">正在逐章搜索…</div>
          ) : results.length ? (
            results.map((result, index) => (
              <button
                type="button"
                className="search-result"
                key={`${result.book.id}-${result.chapter}-${index}`}
                onClick={() => onOpenBook(result.book.id, result.chapter)}
              >
                <span className="sr-top">
                  <span className="sr-book">{result.book.title}</span>
                  <span className="sr-chapter">
                    第 {result.chapter + 1} 章 ·{' '}
                    {result.book.chapterTitles[result.chapter] ?? ''}
                  </span>
                </span>
                <span className="sr-snippet">
                  <Highlight text={result.snippet} query={query} />
                </span>
              </button>
            ))
          ) : (
            <div className="modal-empty">没有在书库里找到「{query}」。</div>
          )
        ) : (
          <>
            <div className="modal-section-label">最近阅读</div>
            {recent.length ? (
              recent.map((book) => {
                const chapter = progress[book.id] ?? 0;
                return (
                  <button
                    type="button"
                    className="recent-row"
                    key={book.id}
                    onClick={() => onOpenBook(book.id, chapter)}
                  >
                    <span className={`cover cover-sm ${coverClass(book.title)}`}>
                      {book.title.slice(0, 1)}
                    </span>
                    <span className="recent-main">
                      <span className="recent-title">{book.title}</span>
                      <span className="recent-meta">
                        {book.author} · 第 {chapter + 1} 章 / 共 {book.chapterCount} 章
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="modal-empty">书库还是空的，先导入一本 TXT 吧。</div>
            )}
          </>
        )}
      </div>

      <div className="search-foot">
        <span>
          <kbd>⌘K</kbd> 随时搜索
        </span>
        <span>共 {books.length} 本书</span>
      </div>
    </ModalShell>
  );
}

const TOC_PAGE_SIZE = 200;

export function TocModal({
  book,
  progress,
  bookmarks,
  onClose,
  onOpenChapter,
}: {
  book: Book;
  progress: number;
  bookmarks: number[];
  onClose: () => void;
  onOpenChapter: (chapter: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(() => Math.floor(progress / TOC_PAGE_SIZE));

  const indexes = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list: number[] = [];
    for (let index = 0; index < book.chapterCount; index += 1) {
      const title = book.chapterTitles[index] ?? '';
      if (!needle || title.toLowerCase().includes(needle) || String(index + 1) === needle) {
        list.push(index);
      }
    }
    return list;
  }, [book, filter]);

  const totalPages = Math.max(1, Math.ceil(indexes.length / TOC_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = indexes.slice(safePage * TOC_PAGE_SIZE, (safePage + 1) * TOC_PAGE_SIZE);
  const from = indexes.length ? safePage * TOC_PAGE_SIZE + 1 : 0;
  const to = Math.min(indexes.length, (safePage + 1) * TOC_PAGE_SIZE);

  return (
    <ModalShell onClose={onClose} className="modal-list">
      <div className="modal-head">
        <div className="modal-head-main">
          <h2>{book.title}</h2>
          <p className="modal-sub">
            {book.author} · 共 {book.chapterCount} 章 · 当前第 {progress + 1} 章
          </p>
          <input
            className="toc-filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
            placeholder="筛选章节，例如「第 12 章」或标题关键词"
            aria-label="筛选章节"
          />
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="modal-scroll">
        {visible.length ? (
          visible.map((index) => (
            <button
              type="button"
              key={index}
              className={`toc-modal-row${index === progress ? ' current' : ''}`}
              onClick={() => onOpenChapter(index)}
            >
              <span className="toc-modal-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="toc-modal-main">
                <span className="toc-modal-title">{book.chapterTitles[index] ?? ''}</span>
              </span>
              {bookmarks.includes(index) ? <Bookmark size={15} fill="currentColor" /> : null}
              {index === progress ? <span className="toc-badge">在读</span> : null}
            </button>
          ))
        ) : (
          <div className="modal-empty">没有匹配的章节。</div>
        )}
      </div>

      <div className="toc-pager">
        <span>
          {indexes.length ? `${from}–${to} / ${indexes.length} 章` : '0 章'}
        </span>
        <div className="toc-pager-btns">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={safePage <= 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            上一页
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function LibraryModal({
  books,
  progress,
  onClose,
  onOpenBook,
  onImport,
  onDelete,
  onRestoreDemo,
}: {
  books: Book[];
  progress: Record<string, number>;
  onClose: () => void;
  onOpenBook: (id: string) => void;
  onImport: () => void;
  onDelete: (id: string) => void;
  onRestoreDemo: () => void;
}) {
  const totalChapters = books.reduce((sum, book) => sum + book.chapterCount, 0);

  return (
    <ModalShell onClose={onClose} className="modal-library">
      <div className="modal-head">
        <div>
          <h2>书库</h2>
          <p className="modal-sub">
            {books.length} 本书 · 共 {totalChapters} 章 · 全部保存在本机
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="modal-scroll">
        {books.length ? (
          books.map((book) => {
            const chapter = progress[book.id] ?? 0;
            const percent = Math.round(((chapter + 1) / Math.max(1, book.chapterCount)) * 100);
            return (
              <div className="lib-row" key={book.id}>
                <button type="button" className="lib-open" onClick={() => onOpenBook(book.id)}>
                  <span className={`cover ${coverClass(book.title)}`}>{book.title.slice(0, 1)}</span>
                  <span className="lib-main">
                    <span className="lib-title">{book.title}</span>
                    <span className="lib-meta">
                      {book.author} · {book.chapterCount} 章 · 已读 {percent}%
                    </span>
                    <span className="lib-bar">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn lib-del"
                  onClick={() => onDelete(book.id)}
                  aria-label={`删除 ${book.title}`}
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        ) : (
          <div className="modal-empty">
            <BookOpen size={22} />
            <p>书库是空的。导入一本 TXT，或载入示例书籍。</p>
          </div>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onRestoreDemo}>
          <LibraryIcon size={16} />
          载入示例书籍
        </button>
        <button type="button" className="btn btn-primary" onClick={onImport}>
          <Upload size={16} />
          导入 TXT
        </button>
      </div>
    </ModalShell>
  );
}

export function SettingsModal({
  settings,
  storage,
  library,
  onChange,
  onClose,
  onResetProgress,
  onClearBooks,
}: {
  settings: Settings;
  storage: { usage: number; quota: number } | null;
  library: { books: number; chars: number };
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onResetProgress: () => void;
  onClearBooks: () => void;
}) {
  return (
    <ModalShell onClose={onClose} className="modal-settings">
      <div className="modal-head">
        <div>
          <h2>设置</h2>
          <p className="modal-sub">阅读体验与本地数据</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="modal-scroll">
        <ReaderControls settings={settings} onChange={onChange} />

        <div className="panel-divider" />

        <div className="panel-heading">数据</div>
        <button type="button" className="list-action" onClick={onResetProgress}>
          <RotateCcw size={16} />
          重置全部阅读进度
        </button>
        <button type="button" className="list-action danger" onClick={onClearBooks}>
          <Trash2 size={16} />
          删除所有书籍
        </button>
        <div className="storage-line">
          <span>书库内容</span>
          <strong>
            {library.books} 本 · {formatChars(library.chars)}
          </strong>
        </div>
        <div className="storage-line">
          <span>浏览器配额</span>
          <strong>{storage && storage.quota > 0 ? formatBytes(storage.quota) : '统计中…'}</strong>
        </div>
        <p className="modal-note">
          书库、进度和书签只保存在这个浏览器里，不会上传到任何服务器。单个 TXT 上限 200 MB；
          超过 20 MB 会以流式方式解析，不占用整块内存。
        </p>

        <div className="panel-divider" />

        <div className="panel-heading">快捷键</div>
        <dl className="shortcuts">
          <div>
            <dt>搜索书库</dt>
            <dd>
              <kbd>⌘</kbd> <kbd>K</kbd>
            </dd>
          </div>
          <div>
            <dt>上一章 / 下一章</dt>
            <dd>
              <kbd>Alt</kbd> <kbd>←</kbd> / <kbd>→</kbd>
            </dd>
          </div>
          <div>
            <dt>发送</dt>
            <dd>
              <kbd>Enter</kbd>
            </dd>
          </div>
          <div>
            <dt>换行</dt>
            <dd>
              <kbd>Shift</kbd> <kbd>Enter</kbd>
            </dd>
          </div>
        </dl>
      </div>
    </ModalShell>
  );
}

export function RenameModal({
  book,
  onClose,
  onConfirm,
}: {
  book: Book;
  onClose: () => void;
  onConfirm: (title: string) => void;
}) {
  const [value, setValue] = useState(book.title);

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    onConfirm(title);
  };

  return (
    <ModalShell onClose={onClose} className="modal-confirm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="confirm-body">
          <h2>重命名</h2>
          <input
            autoFocus
            className="text-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="书名"
          />
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            保存
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = '删除',
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onClose} className="modal-confirm">
      <div className="confirm-body">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} className="modal-about">
      <div className="about-body">
        <span className="about-mark">
          <Mark size={34} />
        </span>
        <h2>Work Reader</h2>
        <p>一个长得像 ChatGPT 的本地小说阅读器。</p>
        <p className="about-small">
          支持导入 TXT、自动分章、全文搜索、朗读与书签。所有内容都留在你的浏览器里。
        </p>
        <button type="button" className="btn btn-primary about-close" onClick={onClose}>
          开始阅读
        </button>
      </div>
    </ModalShell>
  );
}

export function ImportOverlay({
  name,
  loaded,
  total,
  chapters,
  onCancel,
}: {
  name: string;
  loaded: number;
  total: number;
  chapters: number;
  onCancel: () => void;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

  return (
    <ModalShell onClose={onCancel} className="modal-import">
      <div className="import-body">
        <h2>正在导入</h2>
        <p className="import-name">{name}</p>
        <div
          className="import-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="import-meta">
          <span>
            {formatBytes(loaded)} / {formatBytes(total)}
          </span>
          <span>{chapters} 章</span>
        </div>
        <p className="modal-note">
          文件只在本机流式解析。可以随时取消，已经写入的章节会被清理干净。
        </p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消导入
        </button>
      </div>
    </ModalShell>
  );
}
