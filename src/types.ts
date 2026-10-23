export type ChapterData = {
  title: string;
  paragraphs: string[];
};

export type Book = {
  id: string;
  title: string;
  author: string;
  intro?: string;
  chapterCount: number;
  chapterTitles: string[];
  chars: number;
  bytes?: number;
  createdAt: number;
  updatedAt: number;
  source: 'demo' | 'import';
};

export type DemoBook = {
  id: string;
  title: string;
  author: string;
  intro?: string;
  createdAt: number;
  updatedAt: number;
  source: 'demo';
  chapters: ChapterData[];
};

export type Settings = {
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  leading: number;
  serif: boolean;
  width: 'standard' | 'wide';
};

export type ChapterHit = {
  chapter: number;
  snippet: string;
};

export type Msg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'chapter';
      bookId: string;
      chapter: number;
      data: ChapterData;
    }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'toc'; bookId: string }
  | {
      id: string;
      role: 'assistant';
      kind: 'hits';
      bookId: string;
      query: string;
      hits: ChapterHit[];
    };
