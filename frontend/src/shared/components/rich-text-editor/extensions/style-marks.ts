import { Mark } from '@tiptap/core';

import { RICH_TEXT_STYLE_CLASSES, type RichTextStyleClass } from '@/shared/utils/rich-text/rich-text-schema';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    styleClass: {
      setStyleClass: (styleClass: RichTextStyleClass) => ReturnType;
      unsetStyleClass: () => ReturnType;
    };
    highlightMark: {
      toggleHighlight: () => ReturnType;
      unsetHighlight: () => ReturnType;
    };
  }
}

function styleClassOf(element: HTMLElement): RichTextStyleClass | null {
  const classes = (element.getAttribute('class') ?? '').split(/\s+/);
  return (RICH_TEXT_STYLE_CLASSES.find((value) => classes.includes(value)) as RichTextStyleClass) ?? null;
}

/** `<span class="rs-lead|rs-small|rs-muted">` from the Styles menu. */
export const StyleClassMark = Mark.create({
  name: 'styleClass',

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => styleClassOf(element),
        renderHTML: (attributes) => (attributes.class ? { class: attributes.class } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span', getAttrs: (element) => (styleClassOf(element as HTMLElement) ? null : false) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },

  addCommands() {
    return {
      setStyleClass:
        (styleClass) =>
        ({ commands }) =>
          commands.setMark(this.name, { class: styleClass }),
      unsetStyleClass:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/** `<mark>` highlight from the Styles menu. */
export const HighlightMark = Mark.create({
  name: 'highlight',

  parseHTML() {
    return [{ tag: 'mark' }];
  },

  renderHTML() {
    return ['mark', 0];
  },

  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
