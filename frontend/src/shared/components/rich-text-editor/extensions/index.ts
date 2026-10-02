import type { Extensions } from '@tiptap/core';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import { Indent } from '@/shared/components/rich-text-editor/extensions/indent';
import { SearchHighlight } from '@/shared/components/rich-text-editor/extensions/search-highlight';
import { SoftHyphen } from '@/shared/components/rich-text-editor/extensions/soft-hyphen';
import { HighlightMark, StyleClassMark } from '@/shared/components/rich-text-editor/extensions/style-marks';
import { isSafeRichTextHref } from '@/shared/utils/rich-text/rich-text-schema';

/** Schema matches RICH_TEXT_ALLOWED_TAGS — no strike/underline (not in the toolbar or allowlist). */
export function buildEditorExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      strike: false,
      underline: false,
      // Gapcursor covers caret placement after a trailing table / rule; a forced empty
      // paragraph would leak into stored HTML and break Cmd+A block toggles.
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: null, rel: null },
        isAllowedUri: (url) => isSafeRichTextHref(url),
      },
    }),
    Subscript.extend({ excludes: 'superscript' }),
    Superscript.extend({ excludes: 'subscript' }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
    StyleClassMark,
    HighlightMark,
    SoftHyphen,
    Indent,
    SearchHighlight,
  ];
}
