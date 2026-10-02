import { useMemo } from 'react';

import type { RichTextLabels, RichTextTheme } from '@/shared/components/rich-text-editor/rich-text-editor.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function useRichTextTheme(): RichTextTheme {
  const { colors, fonts, typography, surfaceRadius } = useAppTheme();
  return useMemo(
    () => ({
      text: colors.text,
      textSoft: colors.textSoft,
      textMuted: colors.textMuted,
      border: colors.border,
      borderStrong: colors.borderStrong,
      surface: colors.surface,
      surfaceMuted: colors.surfaceMuted,
      surfaceHover: colors.surfaceHover,
      primary: colors.primary,
      primaryTint: colors.primaryTint,
      onPrimaryTint: colors.onPrimaryTint,
      textOnPrimary: colors.textOnPrimary,
      danger: colors.danger,
      highlight: colors.ochreTint,
      highlightStrong: colors.warning,
      fontFamily: fonts.sans,
      monoFamily: fonts.mono,
      fontSize: typography.fieldInput.fontSize,
      lineHeight: typography.fieldInput.lineHeight,
      radius: surfaceRadius.input,
      controlRadius: Math.max(4, Math.min(8, surfaceRadius.button)),
    }),
    [colors, fonts, surfaceRadius, typography],
  );
}

const LABEL_KEYS: (keyof RichTextLabels)[] = [
  'toolbar', 'styles', 'styleNormal', 'styleLead', 'styleSmall', 'styleMuted', 'styleHighlight', 'styleCode',
  'paragraph', 'heading', 'preformatted', 'bold', 'italic', 'subscript', 'superscript', 'softHyphen',
  'numberedList', 'bulletedList', 'indent', 'outdent', 'blockquote', 'alignment', 'alignLeft', 'alignCenter',
  'alignRight', 'alignJustify', 'findReplace', 'find', 'replaceWith', 'replace', 'replaceAll', 'matchCase',
  'previous', 'next', 'noMatches', 'close', 'link', 'linkUrl', 'linkNewTab', 'linkSave', 'linkRemove',
  'linkInvalid', 'removeFormat', 'undo', 'redo', 'table', 'tableInsert', 'tableAddRowBefore', 'tableAddRowAfter',
  'tableAddColumnBefore', 'tableAddColumnAfter', 'tableDeleteRow', 'tableDeleteColumn', 'tableToggleHeader',
  'tableMergeCells', 'tableSplitCell', 'tableDelete', 'horizontalLine', 'specialCharacters', 'source', 'sourceHint',
];

export function useRichTextLabels(): RichTextLabels {
  const { t } = useTranslation();
  return useMemo(() => {
    const labels = Object.fromEntries(LABEL_KEYS.map((key) => [key, t(`richText.${key}`)])) as RichTextLabels;
    labels.matchCount = t('richText.matchCount', { current: '{{current}}', total: '{{total}}' });
    return labels;
  }, [t]);
}
