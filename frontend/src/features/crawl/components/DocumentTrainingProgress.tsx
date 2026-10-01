import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlSourceProgressBar } from '@/features/crawl/components/CrawlSourceProgressBar';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { isDocumentTrainingActive } from '@/features/crawl/utils/crawl-document-status';
import { formatDocumentTrainingDetail } from '@/features/crawl/utils/document-training-status';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  layout: 'table' | 'card';
};

/** Live bar + one-line detail (stage, pieces, time left) while a document trains. */
export function DocumentTrainingProgress({ document, layout }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  if (!isDocumentTrainingActive(document)) return null;

  const progress = document.trainingProgress;
  const detail = formatDocumentTrainingDetail(document, t);

  return (
    <View style={styles.root}>
      {progress ? <CrawlSourceProgressBar value={progress.percent} layout={layout} /> : null}
      {detail ? (
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
    width: '100%',
  },
});
