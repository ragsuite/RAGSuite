import React from 'react';

import RichTextEditorDom from '@/shared/components/rich-text-editor/dom/RichTextEditorDom';
import type { RichTextEditorDomProps } from '@/shared/components/rich-text-editor/rich-text-editor.types';

/** Native: the same TipTap editor inside a WebView (Expo DOM component) sized to its content. */
export function RichTextEditorSurface(props: RichTextEditorDomProps) {
  return <RichTextEditorDom {...props} dom={{ matchContents: true, scrollEnabled: false, keyboardDisplayRequiresUserAction: false }} />;
}
