import { useMemo, useState } from 'react';
import {
  Library,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Search,
  Settings2,
  SquarePen,
  Trash2,
} from 'lucide-react';
import type { Book } from '../types';
import { Mark } from './Logo';
import { Menu } from './Menu';

function groupLabel(ts: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return '今天';
  if (ts >= startOfToday - 86_400_000) return '昨天';
  if (ts >= startOfToday - 7 * 86_400_000) return '过去 7 天';
  return '更早';
}

type SidebarProps = {
  books: Book[];
  activeId: string | null;
  progress: Record<string, number>;
  onCollapse: () => void;
  onNew: () => void;
  onSearch: () => void;
  onLibrary: () => void;
  onOpenBook: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
};

export function Sidebar({
  books,
  activeId,
  progress,
  onCollapse,
  onNew,
  onSearch,
  onLibrary,
  onOpenBook,
  onRename,
  onDelete,
  onSettings,
}: SidebarProps) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const groups = useMemo(() => {
    const order = ['今天', '昨天', '过去 7 天', '更早'];
    const buckets = new Map<string, Book[]>(order.map((label) => [label, []]));
    for (const book of [...books].sort((a, b) => b.updatedAt - a.updatedAt)) {
      buckets.get(groupLabel(book.updatedAt))?.push(book);
    }
    return order
      .map((label) => ({ label, items: buckets.get(label) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [books]);

  return (
    <aside className="sidebar" aria-label="书库侧边栏">
      <div className="sidebar-top">
        <span className="brand" title="Work Reader">
          <Mark size={22} />
        </span>
        <div className="sidebar-top-actions">
          <button type="button" className="icon-btn" aria-label="搜索" onClick={onSearch}>
            <Search size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="收起侧边栏" onClick={onCollapse}>
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button type="button" className="nav-row nav-primary" onClick={onNew}>
          <SquarePen size={18} />
          <span>新对话</span>
        </button>
        <button type="button" className="nav-row" onClick={onSearch}>
          <Search size={18} />
          <span>搜索对话</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
        <button type="button" className="nav-row" onClick={onLibrary}>
          <Library size={18} />
          <span>书库</span>
          <span className="nav-count">{books.length}</span>
        </button>
      </nav>

      <div className="sidebar-scroll">
        {groups.map((group) => (
          <section className="chat-group" key={group.label}>
            <div className="group-label">{group.label}</div>
            {group.items.map((book) => {
              const chapter = progress[book.id] ?? 0;
              return (
                <div
                  key={book.id}
                  className={`chat-row${book.id === activeId ? ' active' : ''}`}
                  title={`${book.title} · 第 ${chapter + 1} 章`}
                >
                  <button type="button" className="chat-link" onClick={() => onOpenBook(book.id)}>
                    <span className="chat-title">{book.title}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-more"
                    aria-label={`${book.title} 的更多操作`}
                    data-popover-trigger
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setMenu({ id: book.id, x: rect.right, y: rect.bottom + 4 });
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="user-row" onClick={onSettings}>
          <span className="avatar-sm">读</span>
          <span className="user-text">
            <span className="user-name">本地读者</span>
            <span className="user-plan">数据仅存本机</span>
          </span>
          <Settings2 size={16} className="user-gear" />
        </button>
      </div>

      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          width={188}
          align="right"
          onClose={() => setMenu(null)}
          items={[
            {
              label: '重命名',
              icon: <Pencil size={15} />,
              onSelect: () => onRename(menu.id),
            },
            {
              label: '删除',
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => onDelete(menu.id),
            },
          ]}
        />
      ) : null}
    </aside>
  );
}
