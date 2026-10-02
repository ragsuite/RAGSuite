import { ChevronDown } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  computeMenuPlacement,
  type MenuPlacement,
} from '@/shared/components/rich-text-editor/toolbar/menu-placement';
import { ToolbarButton } from '@/shared/components/rich-text-editor/toolbar/ToolbarButton';
import { useEscapeClose } from '@/shared/components/rich-text-editor/toolbar/use-escape-close';

type Props = {
  label: string;
  /** Button content; defaults to `icon` + chevron. */
  icon?: React.ReactNode;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  align?: 'left' | 'right';
  buttonClassName?: string;
  menuClassName?: string;
  /** Controlled open state (e.g. Cmd+K opens the link popover). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => React.ReactNode;
};

/** Toolbar menu: closes on outside click, Escape, or after an item runs. */
export function ToolbarDropdown({
  label,
  icon,
  text,
  active,
  disabled,
  align = 'left',
  buttonClassName,
  menuClassName,
  open: controlledOpen,
  onOpenChange,
  children,
}: Props) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const preferRight = align === 'right';
  const [placement, setPlacement] = useState<MenuPlacement>({ dropUp: false, alignRight: preferRight });

  useLayoutEffect(() => {
    if (!open) {
      setPlacement({ dropUp: false, alignRight: preferRight });
      return;
    }
    if (rootRef.current && menuRef.current) {
      setPlacement(computeMenuPlacement(rootRef.current, menuRef.current, preferRight));
    }
  }, [open, preferRight]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  useEscapeClose(open, close, rootRef);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [close, open]);

  useEffect(() => {
    if (disabled && open) close();
  }, [close, disabled, open]);

  return (
    <div className="rs-dd" ref={rootRef}>
      <ToolbarButton
        label={label}
        active={active}
        disabled={disabled}
        expanded={open}
        className={buttonClassName}
        icon={icon}
        onClick={() => setOpen(!open)}>
        {text !== undefined ? <span className="rs-select-label">{text}</span> : null}
        <ChevronDown size={14} aria-hidden />
      </ToolbarButton>
      {open ? (
        <div
          ref={menuRef}
          className={[
            'rs-menu',
            placement.alignRight ? 'align-right' : '',
            placement.dropUp ? 'drop-up' : '',
            menuClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const items = Array.from(
              (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            );
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
            items[(next + items.length) % items.length]?.focus();
          }}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

type ItemProps = {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  onSelect: () => void;
};

export function MenuItem({ label, checked, disabled, icon, className, onSelect }: ItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={['rs-item', className].filter(Boolean).join(' ')}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="rs-menu-sep" role="separator" />;
}
