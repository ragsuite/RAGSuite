import { buildEditorCss } from '@/shared/components/rich-text-editor/dom/editor-css';
import type { RichTextTheme } from '@/shared/components/rich-text-editor/rich-text-editor.types';

const theme: RichTextTheme = {
  text: '#111',
  textSoft: '#444',
  textMuted: '#888',
  border: '#ddd',
  borderStrong: '#ccc',
  surface: '#fff',
  surfaceMuted: '#f5f5f5',
  surfaceHover: '#eee',
  primary: '#060',
  primaryTint: '#cfc',
  onPrimaryTint: '#040',
  textOnPrimary: '#fff',
  danger: '#c00',
  highlight: '#ff0',
  highlightStrong: '#fa0',
  fontFamily: 'sans-serif',
  monoFamily: 'monospace',
  fontSize: 14,
  lineHeight: 22,
  radius: 8,
  controlRadius: 6,
};

describe('buildEditorCss', () => {
  it('resizes the outer editor and keeps inner source and visual panes scrolling', () => {
    const css = buildEditorCss(theme, 96);
    expect(css).toMatch(/\.rs-rte\{[^}]*resize:vertical/);
    expect(css).toMatch(/\.rs-source\{[^}]*resize:none/);
    expect(css).toMatch(/\.rs-content \.ProseMirror\{[^}]*resize:none/);
  });
});
