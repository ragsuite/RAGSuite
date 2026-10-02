import type { RichTextTheme } from '@/shared/components/rich-text-editor/rich-text-editor.types';

/** Toolbar + menus chrome, scoped to `.rs-rte`. */
function chromeCss(t: RichTextTheme): string {
  return `
.rs-rte{position:relative;border:1px solid ${t.borderStrong};border-radius:${t.radius}px;background:${t.surface};color:${t.text};font-family:${t.fontFamily},system-ui,sans-serif;font-size:${t.fontSize}px;transition:border-color .15s ease,box-shadow .15s ease}
.rs-rte.is-focused{border-color:${t.primary};box-shadow:0 0 0 3px ${t.primaryTint}}
.rs-rte.is-invalid{border-color:${t.danger}}
.rs-rte.is-disabled{opacity:.72;background:${t.surfaceMuted}}
.rs-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px;border-bottom:1px solid ${t.border};background:${t.surfaceMuted};border-radius:${t.radius}px ${t.radius}px 0 0}
.rs-sep{width:1px;align-self:stretch;margin:4px 4px;background:${t.border}}
.rs-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:32px;height:32px;padding:0 6px;border:1px solid transparent;border-radius:${t.controlRadius}px;background:transparent;color:${t.text};font:inherit;font-size:13px;line-height:1;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,color .12s ease}
.rs-btn:hover:not(:disabled){background:${t.surfaceHover};border-color:${t.border}}
.rs-btn:active:not(:disabled){background:${t.border};transform:translateY(.5px)}
.rs-btn[aria-pressed="true"],.rs-btn[aria-expanded="true"]{background:${t.primaryTint};color:${t.onPrimaryTint};border-color:transparent}
.rs-btn:disabled{color:${t.textMuted};opacity:.55;cursor:not-allowed}
.rs-btn:focus-visible{outline:2px solid ${t.primary};outline-offset:1px}
.rs-btn[data-tip]:hover:not(:disabled)::after,.rs-btn[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:30;padding:4px 8px;border-radius:6px;background:${t.text};color:${t.surface};font-size:12px;white-space:nowrap;pointer-events:none}
.rs-btn-text{font-weight:600;font-size:13px}
.rs-select{min-width:112px;justify-content:space-between;padding:0 8px}
.rs-select .rs-select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px}
.rs-dd{position:relative;display:inline-flex}
.rs-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:40;min-width:180px;padding:4px;border:1px solid ${t.border};border-radius:${t.controlRadius + 2}px;background:${t.surface};box-shadow:0 8px 24px rgba(0,0,0,.14)}
.rs-menu.align-right{left:auto;right:0}
.rs-menu.drop-up{top:auto;bottom:calc(100% + 4px)}
.rs-item{display:flex;width:100%;align-items:center;gap:8px;padding:7px 10px;border:0;border-radius:${t.controlRadius}px;background:transparent;color:${t.text};font:inherit;font-size:14px;text-align:left;cursor:pointer}
.rs-item:hover:not(:disabled),.rs-item:focus-visible{background:${t.surfaceHover};outline:none}
.rs-item[aria-checked="true"]{background:${t.primaryTint};color:${t.onPrimaryTint}}
.rs-item:disabled{color:${t.textMuted};cursor:not-allowed}
.rs-menu-sep{height:1px;margin:4px 2px;background:${t.border}}
.rs-grid{display:grid;grid-template-columns:repeat(8,18px);gap:3px;padding:6px}
.rs-cell{width:18px;height:18px;border:1px solid ${t.borderStrong};border-radius:3px;background:${t.surface};cursor:pointer;padding:0}
.rs-cell.on{background:${t.primaryTint};border-color:${t.primary}}
.rs-grid-label{padding:2px 8px 6px;font-size:12px;color:${t.textSoft};text-align:center}
.rs-chars{display:grid;grid-template-columns:repeat(8,32px);gap:2px;padding:6px;max-height:220px;overflow:auto}
.rs-char{height:32px;border:1px solid transparent;border-radius:6px;background:transparent;color:${t.text};font-size:16px;cursor:pointer}
.rs-char:hover,.rs-char:focus-visible{background:${t.surfaceHover};border-color:${t.border};outline:none}
.rs-panel{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-bottom:1px solid ${t.border};background:${t.surface}}
.rs-input{height:32px;min-width:140px;flex:1;padding:0 8px;border:1px solid ${t.borderStrong};border-radius:${t.controlRadius}px;background:${t.surface};color:${t.text};font:inherit;font-size:14px}
.rs-input:focus{outline:none;border-color:${t.primary};box-shadow:0 0 0 2px ${t.primaryTint}}
.rs-check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:${t.textSoft};cursor:pointer}
.rs-meta{font-size:12px;color:${t.textSoft};min-width:64px}
.rs-error{font-size:12px;color:${t.danger}}
.rs-primary{background:${t.primary};color:${t.textOnPrimary};border-color:${t.primary}}
.rs-primary:hover:not(:disabled){background:${t.primary};filter:brightness(.94)}
.rs-link-pop{width:300px;display:flex;flex-direction:column;gap:8px;padding:10px}
.rs-row{display:flex;gap:6px;justify-content:flex-end}
.rs-source{display:block;width:100%;box-sizing:border-box;border:0;padding:12px 14px;background:${t.surface};color:${t.text};font-family:${t.monoFamily},ui-monospace,monospace;font-size:13px;line-height:1.5;resize:vertical;outline:none}
.rs-source-hint{padding:6px 14px;font-size:12px;color:${t.textSoft};border-top:1px solid ${t.border}}
`;
}

/** Long content scrolls inside the field so the toolbar stays reachable (hosts may clip overflow). */
function maxContentHeight(minHeight: number): number {
  return Math.max(minHeight * 3, 420);
}

/** Editable content area; mirrors the widget renderer styles. */
function contentCss(t: RichTextTheme, minHeight: number): string {
  const maxHeight = maxContentHeight(minHeight);
  return `
.rs-hidden{display:none}
.rs-source{min-height:${minHeight}px;max-height:${maxHeight}px}
.rs-content .ProseMirror{min-height:${minHeight}px;max-height:${maxHeight}px;overflow-y:auto;padding:12px 14px;outline:none;line-height:${t.lineHeight}px;word-wrap:break-word;white-space:pre-wrap}
.rs-content .ProseMirror p{margin:0 0 .6em}
.rs-content .ProseMirror h1,.rs-content .ProseMirror h2,.rs-content .ProseMirror h3,.rs-content .ProseMirror h4{margin:.8em 0 .4em;line-height:1.25;font-weight:650}
.rs-content .ProseMirror h1{font-size:1.6em}.rs-content .ProseMirror h2{font-size:1.35em}.rs-content .ProseMirror h3{font-size:1.18em}.rs-content .ProseMirror h4{font-size:1.05em}
.rs-content .ProseMirror ul,.rs-content .ProseMirror ol{margin:0 0 .6em;padding-left:1.5em}
.rs-content .ProseMirror li>p{margin:0 0 .2em}
.rs-content .ProseMirror blockquote{margin:0 0 .6em;padding:.2em 0 .2em 1em;border-left:3px solid ${t.borderStrong};color:${t.textSoft}}
.rs-content .ProseMirror pre{margin:0 0 .6em;padding:10px 12px;border-radius:6px;background:${t.surfaceMuted};font-family:${t.monoFamily},ui-monospace,monospace;font-size:.9em;white-space:pre-wrap}
.rs-content .ProseMirror code{padding:1px 4px;border-radius:4px;background:${t.surfaceMuted};font-family:${t.monoFamily},ui-monospace,monospace;font-size:.9em}
.rs-content .ProseMirror hr{border:0;border-top:1px solid ${t.borderStrong};margin:1em 0}
.rs-content .ProseMirror hr.ProseMirror-selectednode{border-top-color:${t.primary}}
.rs-content .ProseMirror a{color:${t.primary};text-decoration:underline}
.rs-content .ProseMirror mark{background:${t.highlight};color:inherit;padding:0 2px;border-radius:2px}
.rs-content .ProseMirror .rs-lead{font-size:1.15em}
.rs-content .ProseMirror .rs-small{font-size:.85em}
.rs-content .ProseMirror .rs-muted{color:${t.textSoft}}
${[1, 2, 3, 4, 5, 6].map((n) => `.rs-content .ProseMirror .rs-indent-${n}{margin-left:${n * 2}em}`).join('')}
.rs-content .ProseMirror table{border-collapse:collapse;width:100%;margin:0 0 .6em;table-layout:fixed}
.rs-content .ProseMirror th,.rs-content .ProseMirror td{border:1px solid ${t.borderStrong};padding:6px 8px;vertical-align:top;position:relative}
.rs-content .ProseMirror th{background:${t.surfaceMuted};font-weight:600;text-align:left}
.rs-content .ProseMirror td>p,.rs-content .ProseMirror th>p{margin:0}
.rs-content .ProseMirror .selectedCell::after{content:"";position:absolute;inset:0;background:${t.primaryTint};opacity:.5;pointer-events:none}
.rs-content .ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);float:left;height:0;color:${t.textMuted};pointer-events:none}
.rs-content .ProseMirror .rs-find-hit{background:${t.highlight};border-radius:2px}
.rs-content .ProseMirror .rs-find-current{background:${t.highlightStrong};color:${t.text}}
`;
}

export function buildEditorCss(theme: RichTextTheme, minHeight: number): string {
  return chromeCss(theme) + contentCss(theme, minHeight);
}
