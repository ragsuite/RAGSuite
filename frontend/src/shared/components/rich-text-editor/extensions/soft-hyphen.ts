import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    softHyphen: {
      insertSoftHyphen: () => ReturnType;
    };
  }
}

/** Inserts U+00AD — an invisible break hint for long words (e.g. German compounds). */
export const SoftHyphen = Extension.create({
  name: 'softHyphen',

  addCommands() {
    return {
      insertSoftHyphen:
        () =>
        ({ commands }) =>
          commands.insertContent('\u00AD'),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift--': () => this.editor.commands.insertSoftHyphen() };
  },
});
