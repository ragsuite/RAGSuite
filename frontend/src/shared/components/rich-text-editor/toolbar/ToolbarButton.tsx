import React from 'react';

type Props = {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  /** Omit for plain action buttons; boolean renders `aria-pressed`. */
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  className?: string;
  onClick: () => void;
};

/** Toolbar control: never steals editor focus; tooltip + pressed state via CSS. */
export function ToolbarButton({
  label,
  shortcut,
  icon,
  children,
  active,
  disabled,
  expanded,
  className,
  onClick,
}: Props) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={['rs-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-expanded={expanded}
      data-tip={expanded ? undefined : tip}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

export function ToolbarSeparator() {
  return <span className="rs-sep" role="separator" aria-orientation="vertical" />;
}
