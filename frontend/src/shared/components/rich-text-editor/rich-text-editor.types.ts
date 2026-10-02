/** Resolved theme tokens passed into the DOM editor (theme hooks are unavailable inside it). */
export type RichTextTheme = {
  text: string;
  textSoft: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  surface: string;
  surfaceMuted: string;
  surfaceHover: string;
  primary: string;
  primaryTint: string;
  onPrimaryTint: string;
  textOnPrimary: string;
  danger: string;
  /** Highlight mark + find hits. */
  highlight: string;
  /** Current find hit. */
  highlightStrong: string;
  fontFamily: string;
  monoFamily: string;
  fontSize: number;
  lineHeight: number;
  radius: number;
  controlRadius: number;
};

/** Translated UI strings for the DOM editor (i18n context is unavailable inside it). */
export type RichTextLabels = {
  toolbar: string;
  styles: string;
  styleNormal: string;
  styleLead: string;
  styleSmall: string;
  styleMuted: string;
  styleHighlight: string;
  styleCode: string;
  paragraph: string;
  heading: string;
  preformatted: string;
  bold: string;
  italic: string;
  subscript: string;
  superscript: string;
  softHyphen: string;
  numberedList: string;
  bulletedList: string;
  indent: string;
  outdent: string;
  blockquote: string;
  alignment: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  findReplace: string;
  find: string;
  replaceWith: string;
  replace: string;
  replaceAll: string;
  matchCase: string;
  previous: string;
  next: string;
  noMatches: string;
  matchCount: string;
  close: string;
  link: string;
  linkUrl: string;
  linkNewTab: string;
  linkSave: string;
  linkRemove: string;
  linkInvalid: string;
  removeFormat: string;
  undo: string;
  redo: string;
  table: string;
  tableInsert: string;
  tableAddRowBefore: string;
  tableAddRowAfter: string;
  tableAddColumnBefore: string;
  tableAddColumnAfter: string;
  tableDeleteRow: string;
  tableDeleteColumn: string;
  tableToggleHeader: string;
  tableMergeCells: string;
  tableSplitCell: string;
  tableDelete: string;
  horizontalLine: string;
  specialCharacters: string;
  source: string;
  sourceHint: string;
};

export type RichTextEditorDomProps = {
  /** Applied whenever `externalVersion` changes (programmatic set / reset). */
  externalValue: string;
  externalVersion: number;
  placeholder: string;
  /** Accessible name of the editable area (usually the field label). */
  ariaLabel: string;
  theme: RichTextTheme;
  labels: RichTextLabels;
  disabled: boolean;
  minHeight: number;
  invalid: boolean;
  onChange: (html: string) => void | Promise<void>;
};
