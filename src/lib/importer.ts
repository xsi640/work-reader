import type { Book } from '../types';
import { removeBook, saveBook, saveChapters } from './db';

/** 单个 TXT 的硬上限：再大就建议先拆分，避免长期占用浏览器存储。 */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
/** 超过这个大小会提示“大文件”。 */
export const LARGE_IMPORT_BYTES = 20 * 1024 * 1024;

const MAX_CHAPTER_CHARS = 60_000;
const AUTO_CHAPTER_CHARS = 8_000;
const WRITE_BATCH = 8;
const PROGRESS_INTERVAL_MS = 120;
/** 没有换行符的超长单行也按这个粒度切开，防止一个字符串无限增长。 */
const MAX_LINE_CHARS = 240_000;

export type ImportProgress = {
  loaded: number;
  total: number;
  chapters: number;
};

export class ImportTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportTooLargeError';
  }
}

const HEADING_RE =
  /^(?:第[〇零一二三四五六七八九十百千两0-9]+[章回节卷部篇集][^\n]{0,40}|序章[^\n]{0,30}|楔子[^\n]{0,30}|尾声[^\n]{0,30}|终章[^\n]{0,30}|Chapter\s+\d+[^\n]{0,60})$/i;

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function abortError() {
  return new DOMException('导入已取消', 'AbortError');
}

/**
 * 流式解析 TXT 并逐章写入 IndexedDB。
 * 全程只保留“当前章节 + 当前段落 + 一个读取块”，不会把整个文件读成字符串。
 */
export async function importTxtFile(
  file: File,
  onProgress: (progress: ImportProgress) => void,
  signal: AbortSignal,
): Promise<Book> {
  if (!file.size) throw new Error('文件是空的');
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportTooLargeError(
      `文件有 ${(file.size / 1024 / 1024).toFixed(0)} MB，超过 ${
        MAX_IMPORT_BYTES / 1024 / 1024
      } MB 上限。建议先按卷拆分，再分别导入。`,
    );
  }

  const id = `import-${Date.now()}-${uid().slice(0, 8)}`;
  const title =
    file.name
      .replace(/\.txt$/i, '')
      .replace(/^《|》$/g, '')
      .trim() || '未命名';

  const chapterTitles: string[] = [];
  const queue: { index: number; title: string; paragraphs: string[] }[] = [];
  let chapterIndex = 0;
  let totalChars = 0;
  let loaded = 0;
  let lastReport = 0;
  let atStart = true;

  let sawHeading = false;
  let autoChapters = 0;
  let baseTitle = '';
  let buffer: string[] = [];
  let paragraphs: string[] = [];
  let chars = 0;
  let part = 0;
  let leftover = '';

  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = now;
    onProgress({ loaded, total: file.size, chapters: chapterIndex });
  };

  const flushQueue = async (force = false): Promise<void> => {
    if (!queue.length || (!force && queue.length < WRITE_BATCH)) return;
    const batch = queue.splice(0, queue.length);
    await saveChapters(id, batch);
    report();
  };

  const writeChapter = async (chapterTitle: string, chapterParas: string[]) => {
    queue.push({ index: chapterIndex, title: chapterTitle, paragraphs: chapterParas });
    chapterTitles.push(chapterTitle);
    chapterIndex += 1;
    for (const paragraph of chapterParas) totalChars += paragraph.length;
    if (queue.length >= WRITE_BATCH) await flushQueue(true);
  };

  const closeParagraph = () => {
    if (!buffer.length) return;
    const text = buffer.join('');
    buffer = [];
    if (text) paragraphs.push(text);
  };

  const flushChapter = async (split: boolean): Promise<void> => {
    closeParagraph();
    if (!paragraphs.length) {
      part = 0;
      return;
    }

    let chapterTitle = baseTitle;
    if (!sawHeading && !chapterTitle) {
      autoChapters += 1;
      chapterTitle = `第 ${autoChapters} 章`;
    }
    if (part > 0) chapterTitle = `${chapterTitle}（续 ${part + 1}）`;

    const payload = paragraphs;
    paragraphs = [];
    chars = 0;
    if (split) part += 1;
    else part = 0;

    await writeChapter(chapterTitle, payload);
  };

  const flushPreface = async (): Promise<void> => {
    closeParagraph();
    if (!paragraphs.length) return;
    const payload = paragraphs;
    paragraphs = [];
    chars = 0;
    part = 0;
    await writeChapter('序', payload);
  };

  const flushBeforeHeading = (): Promise<void> | void => {
    if (!sawHeading) {
      closeParagraph();
      sawHeading = true;
      if (chars >= 80 && chapterIndex === 0) {
        return flushPreface();
      }
      // 书名、作者、来源声明之类的短前言不单独成章。
      paragraphBufferReset();
      return;
    }
    return flushChapter(false);
  };

  const paragraphBufferReset = () => {
    buffer = [];
    paragraphs = [];
    chars = 0;
    part = 0;
  };

  const handleLine = (rawLine: string): Promise<void> | void => {
    let line = rawLine.replace(/\r$/, '');
    if (atStart) {
      atStart = false;
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    }

    // 某些导出工具会把整本书压成一行；按固定长度强切，避免字符串无限增长。
    if (line.length > MAX_LINE_CHARS) {
      return (async () => {
        for (let i = 0; i < line.length; i += MAX_CHAPTER_CHARS) {
          const pending = handleLine(line.slice(i, i + MAX_CHAPTER_CHARS));
          if (pending) await pending;
          if (signal.aborted) throw abortError();
        }
      })();
    }

    const trimmed = line.trim();

    if (trimmed && HEADING_RE.test(trimmed)) {
      const pending = flushBeforeHeading();
      baseTitle = trimmed;
      part = 0;
      return pending;
    }

    if (!trimmed) {
      closeParagraph();
      if (!sawHeading && chars >= AUTO_CHAPTER_CHARS) return flushChapter(false);
      if (sawHeading && chars >= MAX_CHAPTER_CHARS) return flushChapter(true);
      return;
    }

    buffer.push(trimmed);
    chars += trimmed.length;
    if (!sawHeading && chars >= AUTO_CHAPTER_CHARS) return flushChapter(false);
    if (sawHeading && chars >= MAX_CHAPTER_CHARS) return flushChapter(true);
    return;
  };

  const feed = async (text: string): Promise<void> => {
    if (signal.aborted) throw abortError();
    const data = leftover + text;
    const lines = data.split('\n');
    leftover = lines.pop() ?? '';
    for (const line of lines) {
      const pending = handleLine(line);
      if (pending) await pending;
      if (signal.aborted) throw abortError();
    }
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let decoder = new TextDecoder('utf-8');

  try {
    if (typeof file.stream === 'function') {
      reader = file.stream().getReader();
      const first = await reader.read();

      if (!first.done) {
        // 先探测编码：中文 TXT 仍有不少 GBK 文件。
        const probe = new TextDecoder('utf-8').decode(first.value, { stream: true });
        if (probe.includes('\uFFFD')) {
          try {
            decoder = new TextDecoder('gbk');
          } catch {
            decoder = new TextDecoder('utf-8');
          }
        }
        loaded += first.value.byteLength;
        await feed(decoder.decode(first.value, { stream: true }));
        report();
      }

      while (true) {
        if (signal.aborted) throw abortError();
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        await feed(decoder.decode(value, { stream: true }));
        report();
      }
      await feed(decoder.decode());
    } else {
      // 老浏览器没有 File.stream()：只接受小文件，避免整文件字符串撑爆内存。
      if (file.size > LARGE_IMPORT_BYTES) {
        throw new ImportTooLargeError(
          '当前浏览器不支持流式读取大文件，请使用新版 Chrome / Edge / Safari / Firefox。',
        );
      }
      const text = await file.text();
      loaded = file.size;
      for (let i = 0; i < text.length; i += 65_536) {
        if (signal.aborted) throw abortError();
        await feed(text.slice(i, i + 65_536));
      }
    }

    if (leftover) {
      const pending = handleLine(leftover);
      if (pending) await pending;
      leftover = '';
    }

    const finalPending = flushChapter(false);
    if (finalPending) await finalPending;
    await flushQueue(true);

    if (!chapterIndex) {
      throw new Error('没有从这个文件里读到内容');
    }

    const now = Date.now();
    const book: Book = {
      id,
      title,
      author: '本地导入',
      chapterCount: chapterIndex,
      chapterTitles,
      chars: totalChars,
      bytes: file.size,
      createdAt: now,
      updatedAt: now,
      source: 'import',
    };
    await saveBook(book);
    loaded = file.size;
    report(true);
    return book;
  } catch (error) {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* 忽略取消读取错误 */
      }
    }
    // 删除已经写入的半成品章节。
    try {
      await removeBook(id);
    } catch {
      /* 清理失败不覆盖原始错误 */
    }
    throw error;
  }
}
