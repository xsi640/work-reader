import { useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Info,
  Library,
  Menu as MenuIcon,
  MoreHorizontal,
  PanelLeft,
  Settings2,
  Upload,
} from 'lucide-react';
import type { Book } from '../types';
import { Menu } from './Menu';

type TopbarProps = {
  activeBook: Book | null;
  books: Book[];
  progress: Record<string, number>;
  sidebarVisible: boolean;
  isMobile: boolean;
  bookmarked: boolean;
  onToggleSidebar: () => void;
  onOpenBook: (id: string) => void;
  onLibrary: () => void;
  onImport: () => void;
  onToggleBookmark: () => void;
  onOpenReaderPanel: (rect: DOMRect) => void;
  onOpenSettings: () => void;
  onAbout: () => void;
};

export function coverClass(title: string): string {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `cover-${hash % 6}`;
}

export function Topbar({
  activeBook,
  books,
  progress,
  sidebarVisible,
  isMobile,
  bookmarked,
  onToggleSidebar,
  onOpenBook,
  onLibrary,
  onImport,
  onToggleBookmark,
  onOpenReaderPanel,
  onOpenSettings,
  onAbout,
}: TopbarProps) {
  const [bookMenu, setBookMenu] = useState<{ x: number; y: number } | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <header className="topbar">
      <div className="topbar-left">
        {!sidebarVisible ? (
          <button type="button" className="icon-btn" aria-label="打开侧边栏" onClick={onToggleSidebar}>
            {isMobile ? <MenuIcon size={18} /> : <PanelLeft size={18} />}
          </button>
        ) : null}

        <div className="title-wrap">
          <button
            type="button"
            className="title-btn"
            data-popover-trigger
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMoreMenu(null);
              setBookMenu({ x: rect.left, y: rect.bottom + 6 });
            }}
          >
            <span className="title-text">{activeBook ? activeBook.title : 'Work Reader'}</span>
            <ChevronDown size={16} className="title-chevron" />
          </button>
        </div>
      </div>

      <div className="topbar-right">
        {activeBook ? (
          <button
            type="button"
            className={`icon-btn${bookmarked ? ' is-on' : ''}`}
            aria-label={bookmarked ? '移除书签' : '添加书签'}
            title={bookmarked ? '移除书签' : '添加书签'}
            onClick={onToggleBookmark}
          >
            {bookmarked ? <BookmarkCheck size={18} fill="currentColor" /> : <Bookmark size={18} />}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn aa-btn"
          data-popover-trigger
          aria-label="阅读显示设置"
          title="阅读显示"
          onClick={(event) => {
            setBookMenu(null);
            onOpenReaderPanel(event.currentTarget.getBoundingClientRect());
          }}
        >
          Aa
        </button>
        <button
          type="button"
          className="icon-btn"
          data-popover-trigger
          aria-label="更多"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setBookMenu(null);
            setMoreMenu({ x: rect.right, y: rect.bottom + 6 });
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {bookMenu ? (
        <Menu
          x={bookMenu.x}
          y={bookMenu.y}
          width={272}
          onClose={() => setBookMenu(null)}
          header={<span className="menu-heading">你的书库</span>}
          items={[
            ...books.slice(0, 8).map((book) => ({
              label: book.title,
              hint: `第 ${(progress[book.id] ?? 0) + 1} 章`,
              icon: <span className={`cover-dot ${coverClass(book.title)}`} />,
              onSelect: () => onOpenBook(book.id),
            })),
            {
              label: '全部书籍',
              icon: <Library size={15} />,
              onSelect: onLibrary,
            },
            {
              label: '导入 TXT',
              icon: <Upload size={15} />,
              onSelect: onImport,
            },
          ]}
        />
      ) : null}

      {moreMenu ? (
        <Menu
          x={moreMenu.x}
          y={moreMenu.y}
          width={200}
          align="right"
          onClose={() => setMoreMenu(null)}
          items={[
            { label: '导入 TXT', icon: <Upload size={15} />, onSelect: onImport },
            { label: '全部书籍', icon: <Library size={15} />, onSelect: onLibrary },
            { label: '阅读设置', icon: <Settings2 size={15} />, onSelect: onOpenSettings },
            { label: '关于', icon: <Info size={15} />, onSelect: onAbout },
          ]}
        />
      ) : null}
    </header>
  );
}
