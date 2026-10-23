import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (target.closest('[data-popover-trigger]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose]);
}

function useClampedPosition(
  ref: React.RefObject<HTMLElement | null>,
  x: number,
  y: number,
  align: 'left' | 'right',
) {
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = align === 'right' ? x - rect.width : x;
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    let top = y;
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8);
    }
    setPos({ left, top });
  }, [ref, x, y, align]);

  return pos;
}

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function Menu({
  x,
  y,
  width = 208,
  items,
  onClose,
  align = 'left',
  header,
}: {
  x: number;
  y: number;
  width?: number;
  items: MenuItem[];
  onClose: () => void;
  align?: 'left' | 'right';
  header?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(ref, x, y, align);
  useDismiss(ref, onClose);

  return createPortal(
    <div
      className="menu"
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top, width }}
    >
      {header ? <div className="menu-header">{header}</div> : null}
      {items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          type="button"
          role="menuitem"
          className={`menu-item${item.danger ? ' danger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon ? <span className="menu-icon">{item.icon}</span> : null}
          <span className="menu-label">{item.label}</span>
          {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function Popover({
  x,
  y,
  width = 288,
  onClose,
  align = 'right',
  children,
  className = '',
}: {
  x: number;
  y: number;
  width?: number;
  onClose: () => void;
  align?: 'left' | 'right';
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(ref, x, y, align);
  useDismiss(ref, onClose);

  return createPortal(
    <div
      className={`menu popover ${className}`}
      ref={ref}
      role="dialog"
      style={{ left: pos.left, top: pos.top, width }}
    >
      {children}
    </div>,
    document.body,
  );
}
