'use no memo'; // Reads the mutable TipTap editor during render.

import type { Editor } from '@tiptap/react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react';
import React from 'react';

import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { ToolbarButton, ToolbarSeparator } from '@/shared/components/rich-text-editor/toolbar/ToolbarButton';
import { MenuItem, ToolbarDropdown } from '@/shared/components/rich-text-editor/toolbar/ToolbarDropdown';

const ICON = 18;

const ALIGNMENTS = [
  { value: 'left', label: 'alignLeft', Icon: AlignLeft },
  { value: 'center', label: 'alignCenter', Icon: AlignCenter },
  { value: 'right', label: 'alignRight', Icon: AlignRight },
  { value: 'justify', label: 'alignJustify', Icon: AlignJustify },
] as const;

type Props = { editor: Editor; labels: RichTextLabels; disabled: boolean; compact: boolean };

function isAligned(editor: Editor, value: string): boolean {
  if (editor.isActive({ textAlign: value })) return true;
  return value === 'left' && !ALIGNMENTS.some((a) => a.value !== 'left' && editor.isActive({ textAlign: a.value }));
}

/** Separate buttons on wide toolbars; a single dropdown when space is tight. */
export function AlignmentControls({ editor, labels, disabled, compact }: Props) {
  const apply = (value: (typeof ALIGNMENTS)[number]['value']) => {
    const chain = editor.chain().focus();
    (value === 'left' ? chain.unsetTextAlign() : chain.setTextAlign(value)).run();
  };

  if (compact) {
    const current = ALIGNMENTS.find((a) => isAligned(editor, a.value)) ?? ALIGNMENTS[0];
    return (
      <ToolbarDropdown label={labels.alignment} icon={<current.Icon size={ICON} aria-hidden />} disabled={disabled}>
        {(close) =>
          ALIGNMENTS.map(({ value, label, Icon }) => (
            <MenuItem
              key={value}
              label={labels[label]}
              icon={<Icon size={16} aria-hidden />}
              checked={current.value === value}
              onSelect={() => {
                apply(value);
                close();
              }}
            />
          ))
        }
      </ToolbarDropdown>
    );
  }

  return (
    <>
      {ALIGNMENTS.slice(0, 3).map(({ value, label, Icon }) => (
        <ToolbarButton
          key={value}
          label={labels[label]}
          icon={<Icon size={ICON} aria-hidden />}
          active={isAligned(editor, value)}
          disabled={disabled}
          onClick={() => apply(value)}
        />
      ))}
      <ToolbarSeparator />
      <ToolbarButton
        label={labels.alignJustify}
        icon={<AlignJustify size={ICON} aria-hidden />}
        active={isAligned(editor, 'justify')}
        disabled={disabled}
        onClick={() => apply('justify')}
      />
    </>
  );
}
