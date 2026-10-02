import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type SearchMatch = { from: number; to: number };

export type SearchState = {
  term: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  index: number;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearch: (term: string, caseSensitive: boolean) => ReturnType;
      findStep: (direction: 1 | -1) => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

export const searchPluginKey = new PluginKey<SearchState>('rsSearch');

const EMPTY: SearchState = { term: '', caseSensitive: false, matches: [], index: 0 };

/** One char per inline offset, so string index == offset inside the textblock. */
function findMatches(doc: PmNode, term: string, caseSensitive: boolean): SearchMatch[] {
  if (!term) return [];
  const needle = caseSensitive ? term : term.toLowerCase();
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => {
      text += child.isText ? (child.text ?? '') : '\uFFFC'.repeat(child.nodeSize);
    });
    const haystack = caseSensitive ? text : text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      matches.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length });
      at = haystack.indexOf(needle, at + needle.length);
    }
    return false;
  });
  return matches;
}

export function getSearchState(state: EditorState): SearchState {
  return searchPluginKey.getState(state) ?? EMPTY;
}

/** Find & replace with inline decorations (no third-party plugin). */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearch:
        (term, caseSensitive) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(searchPluginKey, { term, caseSensitive, index: 0 }));
          return true;
        },
      findStep:
        (direction) =>
        ({ state, tr, dispatch, view }) => {
          const current = getSearchState(state);
          if (!current.matches.length) return false;
          const index = (current.index + direction + current.matches.length) % current.matches.length;
          if (dispatch) {
            dispatch(tr.setMeta(searchPluginKey, { index }));
            const match = current.matches[index];
            view.domAtPos(match.from).node.parentElement?.scrollIntoView?.({ block: 'nearest' });
          }
          return true;
        },
      replaceCurrent:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const current = getSearchState(state);
          const match = current.matches[current.index];
          if (!match) return false;
          if (dispatch) dispatch(tr.insertText(replacement, match.from, match.to));
          return true;
        },
      replaceAll:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const { matches } = getSearchState(state);
          if (!matches.length) return false;
          [...matches].reverse().forEach((match) => tr.insertText(replacement, match.from, match.to));
          if (dispatch) dispatch(tr);
          return true;
        },
      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(searchPluginKey, { term: '', index: 0 }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(searchPluginKey) as Partial<SearchState> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const term = meta?.term ?? prev.term;
            const caseSensitive = meta?.caseSensitive ?? prev.caseSensitive;
            const matches = findMatches(tr.doc, term, caseSensitive);
            const wanted = meta?.index ?? prev.index;
            const index = matches.length ? Math.min(wanted, matches.length - 1) : 0;
            return { term, caseSensitive, matches, index };
          },
        },
        props: {
          decorations(state) {
            const { matches, index } = getSearchState(state);
            if (!matches.length) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              matches.map((match, i) =>
                Decoration.inline(match.from, match.to, {
                  class: i === index ? 'rs-find-hit rs-find-current' : 'rs-find-hit',
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
