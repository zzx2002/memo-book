import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react';
import { Icon } from './Icon';

interface DropdownProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  align?: 'left' | 'right';
  children: ReactNode;
}

/** 固定定位的下拉菜单，避免被面板的 overflow 裁掉 */
export function Dropdown({ open, anchorRef, onClose, align = 'right', children }: DropdownProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const box = boxRef.current;
    if (!anchor || !box) return;
    const a = anchor.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const rawLeft = align === 'right' ? a.right - b.width : a.left;
    setPos({
      top: Math.max(8, Math.min(a.bottom + 6, window.innerHeight - b.height - 8)),
      left: Math.max(8, Math.min(rawLeft, window.innerWidth - b.width - 8))
    });
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-dropdown]')) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return (
    <div
      ref={boxRef}
      data-dropdown
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-50 min-w-[176px] rounded-xl border border-line bg-pane p-1.5 shadow-pop"
    >
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  on,
  danger,
  onClick
}: {
  children: ReactNode;
  on?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`menu-item${on ? ' on' : ''}${danger ? ' danger-ink' : ''}`}
    >
      <span className="grid w-3.5 flex-none place-items-center">
        {on ? <Icon name="check" size={11} /> : null}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}
