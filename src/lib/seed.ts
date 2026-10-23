import { DEMO_BOOKS } from '../data/demo';
import type { Book } from '../types';
import { saveBook, saveChapters } from './db';

const DAY = 86_400_000;

export async function seedDemoBooks(refreshTimestamps = false): Promise<Book[]> {
  const stamp = Date.now();
  const books: Book[] = [];

  for (let index = 0; index < DEMO_BOOKS.length; index += 1) {
    const demo = DEMO_BOOKS[index];
    const book: Book = {
      id: demo.id,
      title: demo.title,
      author: demo.author,
      intro: demo.intro,
      chapterCount: demo.chapters.length,
      chapterTitles: demo.chapters.map((chapter) => chapter.title),
      chars: demo.chapters.reduce(
        (sum, chapter) => sum + chapter.paragraphs.join('').length,
        0,
      ),
      createdAt: refreshTimestamps ? stamp - (index + 10) * DAY : demo.createdAt,
      updatedAt: refreshTimestamps ? stamp - index * DAY : demo.updatedAt,
      source: 'demo',
    };

    await saveBook(book);
    await saveChapters(
      demo.id,
      demo.chapters.map((chapter, chapterIndex) => ({
        index: chapterIndex,
        title: chapter.title,
        paragraphs: chapter.paragraphs,
      })),
    );
    books.push(book);
  }

  return books;
}
