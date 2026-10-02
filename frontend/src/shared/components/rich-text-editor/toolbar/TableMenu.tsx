'use no memo'; // Reads the mutable TipTap editor during render.

import type { Editor } from '@tiptap/react';
import { Table } from 'lucide-react';
import React, { useState } from 'react';

import type { RichTextLabels } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { MenuItem, MenuSeparator, ToolbarDropdown } from '@/shared/components/rich-text-editor/toolbar/ToolbarDropdown';

const GRID = 8;

type Props = { editor: Editor; labels: RichTextLabels; disabled: boolean };

function SizeGrid({ onPick, insertLabel }: { onPick: (rows: number, cols: number) => void; insertLabel: string }) {
  const [hover, setHover] = useState({ rows: 1, cols: 1 });
  return (
    <>
      <div className="rs-grid" onMouseLeave={() => setHover({ rows: 1, cols: 1 })}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const row = Math.floor(i / GRID) + 1;
          const col = (i % GRID) + 1;
          const on = row <= hover.rows && col <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              className={on ? 'rs-cell on' : 'rs-cell'}
              aria-label={`${insertLabel} ${row} × ${col}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onFocus={() => setHover({ rows: row, cols: col })}
              onClick={() => onPick(row, col)}
            />
          );
        })}
      </div>
      <div className="rs-grid-label" aria-live="polite">
        {hover.rows} × {hover.cols}
      </div>
    </>
  );
}

/** Insert grid plus row/column/cell actions while the caret is in a table. */
export function TableMenu({ editor, labels, disabled }: Props) {
  const inTable = editor.isActive('table');
  const can = editor.can();
  const action = (label: keyof RichTextLabels, enabled: boolean, run: () => void, close: () => void) => (
    <MenuItem
      key={label}
      label={labels[label]}
      disabled={!enabled}
      onSelect={() => {
        run();
        close();
      }}
    />
  );

  return (
    <ToolbarDropdown label={labels.table} icon={<Table size={18} aria-hidden />} active={inTable} disabled={disabled}>
      {(close) => (
        <>
          <SizeGrid
            insertLabel={labels.tableInsert}
            onPick={(rows, cols) => {
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
              close();
            }}
          />
          {inTable ? (
            <>
              <MenuSeparator />
              {action('tableAddRowBefore', can.addRowBefore(), () => editor.chain().focus().addRowBefore().run(), close)}
              {action('tableAddRowAfter', can.addRowAfter(), () => editor.chain().focus().addRowAfter().run(), close)}
              {action('tableAddColumnBefore', can.addColumnBefore(), () => editor.chain().focus().addColumnBefore().run(), close)}
              {action('tableAddColumnAfter', can.addColumnAfter(), () => editor.chain().focus().addColumnAfter().run(), close)}
              <MenuSeparator />
              {action('tableDeleteRow', can.deleteRow(), () => editor.chain().focus().deleteRow().run(), close)}
              {action('tableDeleteColumn', can.deleteColumn(), () => editor.chain().focus().deleteColumn().run(), close)}
              {action('tableToggleHeader', can.toggleHeaderRow(), () => editor.chain().focus().toggleHeaderRow().run(), close)}
              {action('tableMergeCells', can.mergeCells(), () => editor.chain().focus().mergeCells().run(), close)}
              {action('tableSplitCell', can.splitCell(), () => editor.chain().focus().splitCell().run(), close)}
              <MenuSeparator />
              {action('tableDelete', can.deleteTable(), () => editor.chain().focus().deleteTable().run(), close)}
            </>
          ) : null}
        </>
      )}
    </ToolbarDropdown>
  );
}
