import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { formatEmbeddedModelDetailLabel } from '@/features/crawl/utils/format-embedded-model-detail-label';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  entry?: ItemEmbeddingCoverageEntry | null;
  activeProvider?: string;
  activeModel?: string;
  /** Shown at the end of the active model row (e.g. stats help icon). */
  accessory?: ReactNode;
};

export function EmbeddingModelsDetail({ entry, activeProvider, activeModel, accessory }: Props) {
  const { colors, typography } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.block}>
      <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
        {t('documents.embedding.modelsLabel')}
      </Text>
      {entry?.embedded_models && entry.embedded_models.length > 0 ? (
        <View style={styles.list}>
          {entry.embedded_models.map((model) => (
            <View key={model.collection} style={styles.item}>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                {formatEmbeddedModelDetailLabel(model)}
              </Text>
              {model.is_active && accessory ? accessory : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 4 }]}>
          {t('documents.embedding.none')}
        </Text>
      )}
      {entry?.missing_active && activeProvider && activeModel ? (
        <Text style={[typography.caption, { color: colors.warning, marginTop: 8, lineHeight: 18 }]}>
          {t('documents.embedding.missingActiveDetail', {
            provider: activeProvider,
            model: activeModel,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 4,
  },
  list: {
    gap: 6,
    marginTop: 4,
  },
  item: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
});
