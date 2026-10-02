'use no memo'; // Reads the mutable TipTap editor during render.

import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { getSearchState } from '@/shared/components/rich-text-editor/extensions/search-highlight';
import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { ToolbarButton } from '@/shared/components/rich-text-editor/toolbar/ToolbarButton';
import { useEscapeClose } from '@/shared/components/rich-text-editor/toolbar/use-escape-close';

type Props = { editor: Editor; labels: RichTextLabels; onClose: () => void };

/** Inline find & replace bar under the toolbar (Enter = next, Shift+Enter = previous). */
export function FindReplacePanel({ editor, labels, onClose }: Props) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { matches, index } = getSearchState(editor.state);

  useEffect(() => {
    editor.commands.setSearch(term, caseSensitive);
  }, [caseSensitive, editor, term]);

  useEffect(() => () => void editor.commands.clearSearch(), [editor]);

  const count = matches.length
    ? labels.matchCount.replace('{{current}}', String(index + 1)).replace('{{total}}', String(matches.length))
    : term
      ? labels.noMatches
      : '';

  const close = () => {
    editor.commands.clearSearch();
    onClose();
    editor.commands.focus();
  };

  useEscapeClose(true, close, panelRef);

  return (
    <div ref={panelRef} className="rs-panel" role="search" aria-label={labels.findReplace}>
      <input
        className="rs-input"
        autoFocus
        aria-label={labels.find}
        placeholder={labels.find}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          editor.commands.findStep(event.shiftKey ? -1 : 1);
        }}
      />
      <span className="rs-meta" aria-live="polite">
        {count}
      </span>
      <ToolbarButton
        label={labels.previous}
        icon={<ChevronUp size={16} aria-hidden />}
        disabled={!matches.length}
        onClick={() => editor.commands.findStep(-1)}
      />
      <ToolbarButton
        label={labels.next}
        icon={<ChevronDown size={16} aria-hidden />}
        disabled={!matches.length}
        onClick={() => editor.commands.findStep(1)}
      />
      <label className="rs-check">
        <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
        {labels.matchCase}
      </label>
      <input
        className="rs-input"
        aria-label={labels.replaceWith}
        placeholder={labels.replaceWith}
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
      />
      <ToolbarButton label={labels.replace} disabled={!matches.length} onClick={() => editor.commands.replaceCurrent(replacement)}>
        <span className="rs-btn-text">{labels.replace}</span>
      </ToolbarButton>
      <ToolbarButton label={labels.replaceAll} disabled={!matches.length} onClick={() => editor.commands.replaceAll(replacement)}>
        <span className="rs-btn-text">{labels.replaceAll}</span>
      </ToolbarButton>
      <ToolbarButton label={labels.close} icon={<X size={16} aria-hidden />} onClick={close} />
    </div>
  );
}
