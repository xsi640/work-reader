import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Library,
  List,
  Shuffle,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Book, Msg } from '../types';
import { Highlight } from './Highlight';
import { Mark } from './Logo';

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
  return Promise.resolve();
}

type ChapterProps = {
  msg: Extract<Msg, { kind: 'chapter' }>;
  book: Book;
  streaming: boolean;
  bookmarked: boolean;
  speaking: boolean;
  onStreamEnd: (id: string) => void;
  onNavigate: (chapter: number) => void;
  onOpenToc: () => void;
  onToggleBookmark: () => void;
  onSpeak: (id: string, text: string) => void;
  showToast: (text: string) => void;
};

function ChapterMessage({
  msg,
  book,
  streaming,
  bookmarked,
  speaking,
  onStreamEnd,
  onNavigate,
  onOpenToc,
  onToggleBookmark,
  onSpeak,
  showToast,
}: ChapterProps) {
  const chapter = msg.data;
  const full = useMemo(() => chapter.paragraphs.join('\n\n'), [chapter]);
  const streamable = full.length <= 20_000;
  const [chars, setChars] = useState(streaming && streamable ? 0 : full.length);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!streaming) {
      setChars(full.length);
      return;
    }
    if (!streamable) {
      setChars(full.length);
      onStreamEnd(msg.id);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !full.length) {
      setChars(full.length);
      onStreamEnd(msg.id);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const speed = Math.max(0.36, full.length / 2400);
    const tick = (now: number) => {
      const next = Math.min(full.length, Math.floor((now - start) * speed));
      setChars(next);
      if (next >= full.length) onStreamEnd(msg.id);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [streaming, streamable, full, msg.id, onStreamEnd]);

  const visible = chars >= full.length ? full : full.slice(0, chars);
  const shown = visible.split('\n\n');
  const lastEmpty = shown.length > 0 && shown[shown.length - 1] === '';
  if (lastEmpty) shown.pop();
  const isStreaming = streaming && streamable && chars < full.length;
  const isLast = msg.chapter >= book.chapterCount - 1;
  const isFirst = msg.chapter <= 0;

  const handleCopy = async () => {
    await copyText(`${chapter.title}\n\n${chapter.paragraphs.join('\n\n')}`);
    setCopied(true);
    showToast('已复制本章');
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={`msg msg-assistant${isStreaming ? ' is-streaming' : ''}`} id={`msg-${msg.id}`}>
      <div className="avatar">
        <Mark size={22} />
      </div>
      <div className="msg-body">
        <div className="chapter-kicker">
          <span>{book.title}</span>
          <span className="dot">·</span>
          <span>
            第 {msg.chapter + 1} 章 / 共 {book.chapterCount} 章
          </span>
        </div>
        <h2 className="chapter-title">{chapter.title}</h2>

        <div className="prose">
          {shown.map((paragraph, index) => (
            <p key={index}>
              {paragraph}
              {isStreaming && index === shown.length - 1 ? <span className="caret" /> : null}
            </p>
          ))}
        </div>

        {!isStreaming ? (
          <>
            <div className="msg-actions">
              <button type="button" className="action-btn" onClick={handleCopy} title="复制本章">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                type="button"
                className={`action-btn${bookmarked ? ' is-on' : ''}`}
                onClick={onToggleBookmark}
                title={bookmarked ? '移除书签' : '加入书签'}
              >
                {bookmarked ? <BookmarkCheck size={16} fill="currentColor" /> : <Bookmark size={16} />}
              </button>
              <button
                type="button"
                className={`action-btn${speaking ? ' is-on' : ''}`}
                onClick={() => onSpeak(msg.id, `${chapter.title}。${chapter.paragraphs.join('')}`)}
                title={speaking ? '停止朗读' : '朗读本章'}
              >
                {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>

            <div className="chapter-foot">
              <span className="chapter-pos">
                {msg.chapter + 1} / {book.chapterCount}
              </span>
              <div className="chapter-nav">
                <button type="button" className="pill" disabled={isFirst} onClick={() => onNavigate(msg.chapter - 1)}>
                  <ChevronLeft size={14} />
                  上一章
                </button>
                <button type="button" className="pill" onClick={onOpenToc}>
                  <List size={14} />
                  目录
                </button>
                <button type="button" className="pill" disabled={isLast} onClick={() => onNavigate(msg.chapter + 1)}>
                  下一章
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

type ThreadProps = {
  messages: Msg[];
  books: Book[];
  progress: Record<string, number>;
  bookmarks: Record<string, number[]>;
  streamingId: string | null;
  speakingId: string | null;
  width: 'standard' | 'wide';
  onStreamEnd: (id: string) => void;
  onNavigate: (chapter: number) => void;
  onOpenToc: () => void;
  onToggleBookmark: (bookId: string, chapter: number) => void;
  onSpeak: (id: string, text: string) => void;
  showToast: (text: string) => void;
};

export function Thread({
  messages,
  books,
  progress,
  bookmarks,
  streamingId,
  speakingId,
  width,
  onStreamEnd,
  onNavigate,
  onOpenToc,
  onToggleBookmark,
  onSpeak,
  showToast,
}: ThreadProps) {
  const bookById = (id: string) => books.find((book) => book.id === id) ?? null;

  return (
    <div className={`thread thread-${width}`}>
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <div className="msg msg-user" id={`msg-${msg.id}`} key={msg.id}>
              <div className="user-bubble">{msg.text}</div>
            </div>
          );
        }

        if (msg.kind === 'chapter') {
          const book = bookById(msg.bookId);
          if (!book) return null;
          return (
            <ChapterMessage
              key={msg.id}
              msg={msg}
              book={book}
              streaming={streamingId === msg.id}
              bookmarked={(bookmarks[msg.bookId] ?? []).includes(msg.chapter)}
              speaking={speakingId === msg.id}
              onStreamEnd={onStreamEnd}
              onNavigate={onNavigate}
              onOpenToc={onOpenToc}
              onToggleBookmark={() => onToggleBookmark(msg.bookId, msg.chapter)}
              onSpeak={onSpeak}
              showToast={showToast}
            />
          );
        }

        if (msg.kind === 'toc') {
          const book = bookById(msg.bookId);
          if (!book) return null;
          const current = progress[book.id] ?? 0;
          const marks = bookmarks[book.id] ?? [];
          const total = book.chapterCount;
          const many = total > 200;
          const start = many ? Math.max(0, current - 10) : 0;
          const end = many ? Math.min(total, current + 11) : total;
          const indexes = Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
          return (
            <div className="msg msg-assistant" id={`msg-${msg.id}`} key={msg.id}>
              <div className="avatar">
                <Mark size={22} />
              </div>
              <div className="msg-body">
                <p className="assistant-text">
                  《{book.title}》共 {total} 章，当前读到第 {current + 1} 章。
                  {many ? ' 目录较长，先显示当前章节附近；完整目录请用章节下方的「目录」按钮。' : ''}
                </p>
                <div className="toc-list">
                  {indexes.map((index) => (
                    <button
                      type="button"
                      key={index}
                      className={`toc-row${index === current ? ' current' : ''}`}
                      onClick={() => onNavigate(index)}
                    >
                      <span className="toc-num">{String(index + 1).padStart(2, '0')}</span>
                      <span className="toc-title">{book.chapterTitles[index] ?? ''}</span>
                      {marks.includes(index) ? <Bookmark size={14} fill="currentColor" /> : null}
                      {index === current ? <span className="toc-badge">在读</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        if (msg.kind === 'hits') {
          const book = bookById(msg.bookId);
          if (!book) return null;
          return (
            <div className="msg msg-assistant" id={`msg-${msg.id}`} key={msg.id}>
              <div className="avatar">
                <Mark size={22} />
              </div>
              <div className="msg-body">
                <p className="assistant-text">
                  在《{book.title}》中找到 {msg.hits.length} 处与「{msg.query}」相关的内容：
                </p>
                <div className="hit-list">
                  {msg.hits.map((hit, index) => (
                    <button
                      type="button"
                      className="hit-row"
                      key={`${hit.chapter}-${index}`}
                      onClick={() => onNavigate(hit.chapter)}
                    >
                      <span className="hit-chapter">
                        第 {hit.chapter + 1} 章 · {book.chapterTitles[hit.chapter] ?? ''}
                      </span>
                      <span className="hit-snippet">
                        <Highlight text={hit.snippet} query={msg.query} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="msg msg-assistant" id={`msg-${msg.id}`} key={msg.id}>
            <div className="avatar">
              <Mark size={22} />
            </div>
            <div className="msg-body">
              {msg.text.split('\n').map((line, index) =>
                line.trim() ? (
                  <p className="assistant-text" key={index}>
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({
  books,
  progress,
  onContinue,
  onRandom,
  onLibrary,
  onImport,
}: {
  books: Book[];
  progress: Record<string, number>;
  onContinue: () => void;
  onRandom: () => void;
  onLibrary: () => void;
  onImport: () => void;
}) {
  const recent = useMemo(
    () => [...books].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
    [books],
  );
  const chapter = recent ? progress[recent.id] ?? 0 : 0;

  return (
    <div className="empty">
      <div className="empty-inner">
        <h1>今晚，读点什么？</h1>
        <div className="suggests">
          <button type="button" className="suggest" onClick={onContinue}>
            <BookOpen size={18} />
            <span>{recent ? `继续阅读《${recent.title}》· 第 ${chapter + 1} 章` : '打开一本示例书'}</span>
          </button>
          <button type="button" className="suggest" onClick={onRandom}>
            <Shuffle size={18} />
            <span>随机读一章</span>
          </button>
          <button type="button" className="suggest" onClick={onLibrary}>
            <Library size={18} />
            <span>打开我的书库</span>
          </button>
          <button type="button" className="suggest" onClick={onImport}>
            <Upload size={18} />
            <span>导入 TXT 文件</span>
          </button>
        </div>
      </div>
    </div>
  );
}
