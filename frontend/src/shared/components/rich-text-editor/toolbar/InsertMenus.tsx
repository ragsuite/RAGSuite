'use no memo'; // Reads the mutable TipTap editor during render.

import type { Editor } from '@tiptap/react';
import { Link, Omega } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { ToolbarDropdown } from '@/shared/components/rich-text-editor/toolbar/ToolbarDropdown';
import { isSafeRichTextHref } from '@/shared/utils/rich-text/rich-text-schema';

const SPECIAL_CHARACTERS = [
  '©', '®', '™', '€', '£', '¥', '¢', '§', '¶', '†', '‡', '•', '…', '–', '—', '«',
  '»', '‹', '›', '„', '“', '”', '‘', '’', '°', '±', '×', '÷', '≠', '≈', '≤', '≥',
  '∞', '√', '∑', 'µ', 'π', 'Ω', 'α', 'β', '←', '→', '↑', '↓', '↔', '½', '¼', '¾',
  '¹', '²', '³', '✓', '✗', '★', '‰', '¿', '¡', 'ß', 'ä', 'ö', 'ü', 'é', 'ç', 'ñ',
];

type MenuProps = { editor: Editor; labels: RichTextLabels; disabled: boolean };

export function SpecialCharsMenu({ editor, labels, disabled }: MenuProps) {
  return (
    <ToolbarDropdown
      label={labels.specialCharacters}
      icon={<Omega size={18} aria-hidden />}
      disabled={disabled}
      align="right">
      {(close) => (
        <div className="rs-chars" role="grid" aria-label={labels.specialCharacters}>
          {SPECIAL_CHARACTERS.map((char) => (
            <button
              key={char}
              type="button"
              className="rs-char"
              aria-label={char}
              title={char}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().insertContent(char).run();
                close();
              }}>
              {char}
            </button>
          ))}
        </div>
      )}
    </ToolbarDropdown>
  );
}

type LinkProps = MenuProps & {
  shortcut: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function normalizeHref(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('#')) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}

/** Link popover: URL, open-in-new-tab, save, remove. Only safe schemes are accepted. */
export function LinkMenu({ editor, labels, disabled, shortcut, open, onOpenChange }: LinkProps) {
  const active = editor.isActive('link');
  const [url, setUrl] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const attrs = editor.getAttributes('link') as { href?: string; target?: string | null };
    setUrl(attrs.href ?? '');
    setNewTab(attrs.target === '_blank');
    setError(false);
    // After menu placement; preventScroll stops overflow-hidden hosts from shifting sideways.
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [editor, open]);

  const save = (close: () => void) => {
    const href = normalizeHref(url);
    if (!href || !isSafeRichTextHref(href)) {
      setError(true);
      return;
    }
    const target = newTab ? '_blank' : null;
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !active) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href, target } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href, target }).run();
    }
    close();
  };

  return (
    <ToolbarDropdown
      label={`${labels.link} (${shortcut})`}
      icon={<Link size={18} aria-hidden />}
      active={active}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}>
      {(close) => (
        <form
          className="rs-link-pop"
          onSubmit={(event) => {
            event.preventDefault();
            save(close);
          }}>
          <input
            className="rs-input"
            type="text"
            inputMode="url"
            ref={inputRef}
            aria-label={labels.linkUrl}
            placeholder={labels.linkUrl}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(false);
            }}
          />
          {error ? <span className="rs-error">{labels.linkInvalid}</span> : null}
          <label className="rs-check">
            <input type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} />
            {labels.linkNewTab}
          </label>
          <div className="rs-row">
            {active ? (
              <button
                type="button"
                className="rs-btn"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  close();
                }}>
                {labels.linkRemove}
              </button>
            ) : null}
            <button type="submit" className="rs-btn rs-primary">
              {labels.linkSave}
            </button>
          </div>
        </form>
      )}
    </ToolbarDropdown>
  );
}
