import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SourceAnswersSwitch } from '@/features/crawl/components/SourceAnswersSwitch';
import type { SourceAnswersChange } from '@/features/crawl/hooks/use-source-answers-toggle';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { documentAnswersLockReason, documentUsedInAnswers } from '@/features/crawl/utils/document-answers';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  onChange: SourceAnswersChange;
  /** Shows the "In answers" caption before the switch (cards); tables label it in the header. */
  labelled?: boolean;
};

/** "Use in answers" switch for a Document, Text or Q&A Pairs source. */
export function DocumentAnswersSwitch({ document, onChange, labelled = false }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const control = (
    <SourceAnswersSwitch
      sourceId={document.id}
      name={document.name}
      usedInAnswers={documentUsedInAnswers(document)}
      lockReason={documentAnswersLockReason(document)}
      onChange={onChange}
    />
  );
  if (!labelled) return control;
  return (
    <View style={[styles.labelled, { gap: spacing.xs }]}>
      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
        {t('crawl.table.col.answers')}
      </Text>
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  labelled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
});
