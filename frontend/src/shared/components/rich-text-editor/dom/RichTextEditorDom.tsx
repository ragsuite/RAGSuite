'use dom';
// The TipTap editor is mutated in place; compiler memoization would freeze editor-derived UI.
'use no memo';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { DOMProps } from 'expo/dom';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { buildEditorCss } from '@/shared/components/rich-text-editor/dom/editor-css';
import { formatSourceHtml } from '@/shared/components/rich-text-editor/dom/format-source-html';
import { buildEditorExtensions } from '@/shared/components/rich-text-editor/extensions';
import type { RichTextEditorDomProps } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { EditorToolbar } from '@/shared/components/rich-text-editor/toolbar/EditorToolbar';
import { FindReplacePanel } from '@/shared/components/rich-text-editor/toolbar/FindReplacePanel';
import { sanitizeRichHtml } from '@/shared/utils/rich-text/rich-text-sanitize';

const COMPACT_WIDTH = 620;

function editorHtml(editor: Editor): string {
  return editor.isEmpty ? '' : editor.getHTML();
}

/**
 * TipTap editor + toolbar. Web renders it inline; native renders it inside a
 * WebView (Expo DOM component), so every prop is serializable.
 */
export default function RichTextEditorDom({
  externalValue,
  externalVersion,
  placeholder,
  ariaLabel,
  theme,
  labels,
  disabled,
  minHeight,
  invalid,
  onChange,
}: RichTextEditorDomProps & { dom?: DOMProps }) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [compact, setCompact] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable references: TipTap calls setOptions whenever an option changes identity.
  const extensions = useMemo(() => buildEditorExtensions(placeholder), [placeholder]);
  const editorProps = useMemo(
    () => ({
      attributes: { 'aria-label': ariaLabel, 'aria-multiline': 'true', 'aria-invalid': invalid ? 'true' : 'false' },
    }),
    [ariaLabel, invalid],
  );
  const initialContent = useMemo(() => sanitizeRichHtml(externalValue), [externalValue]);
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !disabled,
    editorProps,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => void onChangeRef.current(editorHtml(current)),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  const appliedVersion = useRef(externalVersion);
  useEffect(() => {
    if (!editor || appliedVersion.current === externalVersion) return;
    appliedVersion.current = externalVersion;
    editor.commands.setContent(sanitizeRichHtml(externalValue), { emitUpdate: false });
    setSourceHtml(formatSourceHtml(editorHtml(editor)));
  }, [editor, externalValue, externalVersion]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_WIDTH));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const css = useMemo(() => buildEditorCss(theme, minHeight), [minHeight, theme]);

  if (!editor) return null;

  const toggleSource = () => {
    if (sourceMode) {
      editor.commands.setContent(sanitizeRichHtml(sourceHtml), { emitUpdate: true });
      setSourceMode(false);
      editor.commands.focus();
      return;
    }
    setFindOpen(false);
    setLinkOpen(false);
    setSourceHtml(formatSourceHtml(editorHtml(editor)));
    setSourceMode(true);
  };

  const onShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || sourceMode || disabled) return;
    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      setFindOpen(true);
    } else if (key === 'k') {
      event.preventDefault();
      setLinkOpen(true);
    }
  };

  const className = [
    'rs-rte',
    focused ? 'is-focused' : '',
    invalid ? 'is-invalid' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} ref={rootRef} onKeyDown={onShortcut}>
      <style>{css}</style>
      <EditorToolbar
        editor={editor}
        labels={labels}
        disabled={disabled}
        sourceMode={sourceMode}
        compact={compact}
        findOpen={findOpen}
        linkOpen={linkOpen}
        onToggleSource={toggleSource}
        onToggleFind={() => setFindOpen((open) => !open)}
        onLinkOpenChange={setLinkOpen}
      />
      {findOpen && !sourceMode ? (
        <FindReplacePanel editor={editor} labels={labels} onClose={() => setFindOpen(false)} />
      ) : null}
      <EditorContent editor={editor} className={sourceMode ? 'rs-content rs-hidden' : 'rs-content'} />
      {sourceMode ? (
        <>
          <textarea
            className="rs-source"
            aria-label={labels.source}
            spellCheck={false}
            value={sourceHtml}
            disabled={disabled}
            onChange={(event) => {
              setSourceHtml(event.target.value);
              void onChangeRef.current(sanitizeRichHtml(event.target.value));
            }}
          />
          <div className="rs-source-hint">{labels.sourceHint}</div>
        </>
      ) : null}
    </div>
  );
}
