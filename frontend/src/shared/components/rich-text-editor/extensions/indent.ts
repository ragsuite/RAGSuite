import { Extension } from '@tiptap/core';

import {
  RICH_TEXT_INDENT_CLASS_PREFIX,
  RICH_TEXT_MAX_INDENT,
} from '@/shared/utils/rich-text/rich-text-schema';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const INDENT_TYPES = ['paragraph', 'heading'];

function parseIndent(element: HTMLElement): number {
  const match = (element.getAttribute('class') ?? '').match(/(?:^|\s)rs-indent-(\d)(?:\s|$)/);
  return match ? Math.min(RICH_TEXT_MAX_INDENT, Number(match[1])) : 0;
}

/** Indent / outdent: list items nest; paragraphs and headings get `rs-indent-N`. */
export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: INDENT_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => parseIndent(element),
            renderHTML: (attributes) =>
              attributes.indent ? { class: `${RICH_TEXT_INDENT_CLASS_PREFIX}${attributes.indent}` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const shift =
      (delta: 1 | -1) =>
      () =>
      ({ editor, state, tr, dispatch, commands }: import('@tiptap/core').CommandProps) => {
        if (editor.isActive('listItem')) {
          return delta > 0 ? commands.sinkListItem('listItem') : commands.liftListItem('listItem');
        }
        let changed = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (!INDENT_TYPES.includes(node.type.name)) return true;
          const current = Number(node.attrs.indent ?? 0);
          const next = Math.max(0, Math.min(RICH_TEXT_MAX_INDENT, current + delta));
          if (next !== current) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
          return false;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return { indent: shift(1), outdent: shift(-1) };
  },
});
