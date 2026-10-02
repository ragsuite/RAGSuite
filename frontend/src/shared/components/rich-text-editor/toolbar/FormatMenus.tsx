'use no memo'; // Reads the mutable TipTap editor during render.

import type { Editor } from '@tiptap/react';
import React from 'react';

import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { MenuItem, MenuSeparator, ToolbarDropdown } from '@/shared/components/rich-text-editor/toolbar/ToolbarDropdown';
import type { RichTextStyleClass } from '@/shared/utils/rich-text/rich-text-schema';

type MenuProps = { editor: Editor; labels: RichTextLabels; disabled: boolean };

const STYLE_CLASSES: { value: RichTextStyleClass; label: keyof RichTextLabels }[] = [
  { value: 'rs-lead', label: 'styleLead' },
  { value: 'rs-small', label: 'styleSmall' },
  { value: 'rs-muted', label: 'styleMuted' },
];

/** Styles: span classes plus highlight and inline code marks. */
export function StylesMenu({ editor, labels, disabled }: MenuProps) {
  const activeClass = STYLE_CLASSES.find((style) => editor.isActive('styleClass', { class: style.value }));
  const highlight = editor.isActive('highlight');
  const code = editor.isActive('code');
  const current = activeClass
    ? labels[activeClass.label]
    : highlight
      ? labels.styleHighlight
      : code
        ? labels.styleCode
        : labels.styles;

  return (
    <ToolbarDropdown label={labels.styles} text={current} disabled={disabled} buttonClassName="rs-select">
      {(close) => (
        <>
          <MenuItem
            label={labels.styleNormal}
            checked={!activeClass && !highlight && !code}
            onSelect={() => {
              editor.chain().focus().unsetStyleClass().unsetHighlight().unsetCode().run();
              close();
            }}
          />
          <MenuSeparator />
          {STYLE_CLASSES.map((style) => (
            <MenuItem
              key={style.value}
              label={labels[style.label]}
              className={style.value}
              checked={activeClass?.value === style.value}
              onSelect={() => {
                const chain = editor.chain().focus();
                (activeClass?.value === style.value ? chain.unsetStyleClass() : chain.setStyleClass(style.value)).run();
                close();
              }}
            />
          ))}
          <MenuItem
            label={labels.styleHighlight}
            checked={highlight}
            onSelect={() => {
              editor.chain().focus().toggleHighlight().run();
              close();
            }}
          />
          <MenuItem
            label={labels.styleCode}
            checked={code}
            onSelect={() => {
              editor.chain().focus().toggleCode().run();
              close();
            }}
          />
        </>
      )}
    </ToolbarDropdown>
  );
}

const HEADING_LEVELS = [1, 2, 3, 4] as const;

/** Paragraph / Heading 1-4 / Preformatted. */
export function BlockFormatMenu({ editor, labels, disabled }: MenuProps) {
  const level = HEADING_LEVELS.find((value) => editor.isActive('heading', { level: value }));
  const pre = editor.isActive('codeBlock');
  const current = level ? `${labels.heading} ${level}` : pre ? labels.preformatted : labels.paragraph;

  return (
    <ToolbarDropdown label={current} text={current} disabled={disabled} buttonClassName="rs-select">
      {(close) => (
        <>
          <MenuItem
            label={labels.paragraph}
            checked={!level && !pre}
            onSelect={() => {
              editor.chain().focus().setParagraph().run();
              close();
            }}
          />
          {HEADING_LEVELS.map((value) => (
            <MenuItem
              key={value}
              label={`${labels.heading} ${value}`}
              checked={level === value}
              onSelect={() => {
                editor.chain().focus().setHeading({ level: value }).run();
                close();
              }}
            />
          ))}
          <MenuItem
            label={labels.preformatted}
            checked={pre}
            onSelect={() => {
              editor.chain().focus().toggleCodeBlock().run();
              close();
            }}
          />
        </>
      )}
    </ToolbarDropdown>
  );
}
