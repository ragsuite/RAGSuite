'use no memo'; // Reads the mutable TipTap editor during render.

import { AllSelection, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  CodeXml,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Subscript,
  Superscript,
  TextSearch,
  Undo2,
} from 'lucide-react';
import React from 'react';

import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { AlignmentControls } from '@/shared/components/rich-text-editor/toolbar/AlignmentControls';
import { BlockFormatMenu, StylesMenu } from '@/shared/components/rich-text-editor/toolbar/FormatMenus';
import { LinkMenu, SpecialCharsMenu } from '@/shared/components/rich-text-editor/toolbar/InsertMenus';
import { TableMenu } from '@/shared/components/rich-text-editor/toolbar/TableMenu';
import { ToolbarButton, ToolbarSeparator } from '@/shared/components/rich-text-editor/toolbar/ToolbarButton';
import { shortcutLabel } from '@/shared/components/rich-text-editor/toolbar/shortcut-label';

const ICON = 18;

type Props = {
  editor: Editor;
  labels: RichTextLabels;
  disabled: boolean;
  sourceMode: boolean;
  compact: boolean;
  findOpen: boolean;
  linkOpen: boolean;
  onToggleSource: () => void;
  onToggleFind: () => void;
  onLinkOpenChange: (open: boolean) => void;
};

/** Cmd+A yields an AllSelection rooted at the doc, which `lift` cannot unwrap; narrow it to text first. */
function toggleBlockquote(editor: Editor) {
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      if (tr.selection instanceof AllSelection) {
        tr.setSelection(TextSelection.between(tr.doc.resolve(0), tr.doc.resolve(tr.doc.content.size)));
      }
      return true;
    })
    .toggleBlockquote()
    .run();
}

/** Roving arrow-key focus across toolbar buttons (WAI-ARIA toolbar pattern). */
function onToolbarKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const target = event.target as HTMLElement;
  if (!target.classList.contains('rs-btn') || target.closest('.rs-menu')) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope .rs-btn:not(:disabled)')).filter(
    (button) => !button.closest('.rs-menu'),
  );
  const at = buttons.indexOf(target as HTMLButtonElement);
  const next = event.key === 'ArrowRight' ? at + 1 : at - 1;
  buttons[(next + buttons.length) % buttons.length]?.focus();
  event.preventDefault();
}

export function EditorToolbar({
  editor,
  labels,
  disabled,
  sourceMode,
  compact,
  findOpen,
  linkOpen,
  onToggleSource,
  onToggleFind,
  onLinkOpenChange,
}: Props) {
  const off = disabled || sourceMode;
  const chain = () => editor.chain().focus();
  const btn = (
    label: string,
    Icon: typeof Bold,
    run: () => void,
    opts: { active?: boolean; enabled?: boolean; shortcut?: string } = {},
  ) => (
    <ToolbarButton
      label={label}
      shortcut={opts.shortcut}
      icon={<Icon size={ICON} aria-hidden />}
      active={opts.active}
      disabled={off || opts.enabled === false}
      onClick={run}
    />
  );

  return (
    <div className="rs-toolbar" role="toolbar" aria-label={labels.toolbar} onKeyDown={onToolbarKeyDown}>
      <StylesMenu editor={editor} labels={labels} disabled={off} />
      <BlockFormatMenu editor={editor} labels={labels} disabled={off} />
      <ToolbarSeparator />
      {btn(labels.bold, Bold, () => chain().toggleBold().run(), { active: editor.isActive('bold'), shortcut: shortcutLabel('B') })}
      {btn(labels.italic, Italic, () => chain().toggleItalic().run(), { active: editor.isActive('italic'), shortcut: shortcutLabel('I') })}
      {btn(labels.subscript, Subscript, () => chain().toggleSubscript().run(), { active: editor.isActive('subscript') })}
      {btn(labels.superscript, Superscript, () => chain().toggleSuperscript().run(), { active: editor.isActive('superscript') })}
      <ToolbarButton
        label={labels.softHyphen}
        shortcut={shortcutLabel('-', true)}
        disabled={off}
        onClick={() => chain().insertSoftHyphen().run()}>
        <span className="rs-btn-text">(-)</span>
      </ToolbarButton>
      <ToolbarSeparator />
      {btn(labels.numberedList, ListOrdered, () => chain().toggleOrderedList().run(), { active: editor.isActive('orderedList') })}
      {btn(labels.bulletedList, List, () => chain().toggleBulletList().run(), { active: editor.isActive('bulletList') })}
      <ToolbarSeparator />
      {btn(labels.indent, IndentIncrease, () => chain().indent().run(), { enabled: editor.can().indent() })}
      {btn(labels.outdent, IndentDecrease, () => chain().outdent().run(), { enabled: editor.can().outdent() })}
      <ToolbarSeparator />
      {btn(labels.blockquote, Quote, () => toggleBlockquote(editor), { active: editor.isActive('blockquote') })}
      <ToolbarSeparator />
      <AlignmentControls editor={editor} labels={labels} disabled={off} compact={compact} />
      <ToolbarSeparator />
      <ToolbarButton
        label={labels.findReplace}
        shortcut={shortcutLabel('F')}
        icon={<TextSearch size={ICON} aria-hidden />}
        active={findOpen}
        disabled={off}
        onClick={onToggleFind}
      />
      <LinkMenu
        editor={editor}
        labels={labels}
        disabled={off}
        shortcut={shortcutLabel('K')}
        open={linkOpen}
        onOpenChange={onLinkOpenChange}
      />
      <ToolbarSeparator />
      {btn(labels.removeFormat, RemoveFormatting, () => chain().unsetAllMarks().unsetTextAlign().run())}
      <ToolbarSeparator />
      {btn(labels.undo, Undo2, () => chain().undo().run(), { enabled: editor.can().undo(), shortcut: shortcutLabel('Z') })}
      {btn(labels.redo, Redo2, () => chain().redo().run(), { enabled: editor.can().redo(), shortcut: shortcutLabel('Z', true) })}
      <ToolbarSeparator />
      <TableMenu editor={editor} labels={labels} disabled={off} />
      {btn(labels.horizontalLine, Minus, () => chain().setHorizontalRule().run())}
      <SpecialCharsMenu editor={editor} labels={labels} disabled={off} />
      <ToolbarSeparator />
      <ToolbarButton
        label={labels.source}
        icon={<CodeXml size={ICON} aria-hidden />}
        active={sourceMode}
        disabled={disabled}
        onClick={onToggleSource}>
        <span className="rs-btn-text">{labels.source}</span>
      </ToolbarButton>
    </div>
  );
}
