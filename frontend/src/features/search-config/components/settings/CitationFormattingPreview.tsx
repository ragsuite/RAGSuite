import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CitationFormat } from '@/features/search-config/types/search-config.types';
import { CitationChip } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const PREVIEW_SOURCES = [{ title: 'Example source document', url: '#' }];

function numberingLabel(style: CitationFormat['numberingStyle'], index: number): string {
  switch (style) {
    case 'parentheses':
      return `(${index + 1})`;
    case 'periods':
      return `${index + 1}.`;
    case 'plain':
      return `${index + 1}`;
    case 'square':
    default:
      return `[${index + 1}]`;
  }
}

function cardPadding(style: CitationFormat['citationStyle']) {
  switch (style) {
    case 'compact':
    case 'minimal':
      return 6;
    case 'card':
      return 10;
    case 'detailed':
    default:
      return 12;
  }
}

function colorSchemeColors(
  scheme: CitationFormat['colorScheme'],
  colors: ReturnType<typeof useAppTheme>['colors'],
) {
  switch (scheme) {
    case 'accent':
      return {
        border: colors.ochre,
        background: colors.ochreTint,
      };
    case 'primary':
      return {
        border: colors.primary,
        background: colors.primaryTint,
      };
    case 'muted':
    default:
      return {
        border: colors.border,
        background: colors.surfaceMuted,
      };
  }
}

type Props = {
  format: CitationFormat;
};

export function CitationFormattingPreview({ format }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const palette = useMemo(() => colorSchemeColors(format.colorScheme, colors), [format.colorScheme, colors]);
  const sources = PREVIEW_SOURCES;
  const isGrid = format.layout === 'grid';

  return (
    <View
      style={[
        styles.previewShell,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
          gap: spacing.sm,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.citations.preview.label')}</Text>

      {format.showSourceCount ? (
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
          {t('search.citations.displayOptions.showSourceCount')} ({sources.length}):
        </Text>
      ) : null}

      <View style={[isGrid ? styles.grid : styles.vertical, { gap: spacing.sm }]}>
        {sources.map((source, index) => (
          <View
            key={source.title}
            style={[
              styles.card,
              isGrid ? styles.gridItem : null,
              {
                borderColor: palette.border,
                backgroundColor: palette.background,
                borderRadius: surfaceRadius.card,
                padding: cardPadding(format.citationStyle),
                borderStyle: format.citationStyle === 'minimal' ? 'dashed' : 'solid',
              },
            ]}>
            <View style={styles.cardRow}>
              <CitationChip index={index + 1} label={numberingLabel(format.numberingStyle, index)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{source.title}</Text>
                {format.showUrls && source.url && source.url !== '#' ? (
                  <Text style={[typography.caption, { color: colors.primary, marginTop: 4 }]}>{t('chatbot.history.viewSource')}</Text>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewShell: {
    borderWidth: 1,
  },
  vertical: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '48%',
    minWidth: 140,
  },
  card: {
    borderWidth: 1,
    width: '100%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
});
