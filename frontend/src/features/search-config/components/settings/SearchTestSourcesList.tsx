import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SearchTestCitation } from '@/features/search-config/types/search-config.types';
import { CitationCard } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Soft bubble curve — dashboard surfaceRadius is ~2px (sharp rectangles). */
const SOURCE_CARD_RADIUS = 16;

type Props = {
  citations: SearchTestCitation[];
  topK?: number;
};

export function SearchTestSourcesList({ citations, topK }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  if (!citations.length) return null;

  return (
    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
      <Text style={[typography.eyebrow, { color: colors.textSoft, fontSize: 11 }]}>
        {t('search.test.sources.topK', { topK: topK ?? citations.length, count: citations.length })}
      </Text>
      <View style={[styles.list, { gap: spacing.xs }]}>
        {citations.map((source, index) => (
          <CitationCard
            key={`${source.id}_${index}`}
            index={index + 1}
            title={source.title}
            url={source.url}
            excerpt={source.excerpt}
            variant="compact"
            borderRadius={SOURCE_CARD_RADIUS}
            indexShape="circle"
            style={styles.cardItem}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
  cardItem: {
    width: '100%',
  },
});
