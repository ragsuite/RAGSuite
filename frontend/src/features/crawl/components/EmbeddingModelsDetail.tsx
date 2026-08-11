import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ItemEmbeddedModel, ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function formatModelLabel(
  model: ItemEmbeddedModel,
  activeProvider?: string,
  activeModel?: string,
): string {
  if (model.is_active && activeProvider && activeModel) {
    return `${activeProvider} / ${activeModel}`;
  }
  if (model.provider && model.model) {
    return `${model.provider} / ${model.model}`;
  }
  if (model.model) return model.model;
  if (model.provider) return model.provider;
  return model.collection;
}

type Props = {
  entry?: ItemEmbeddingCoverageEntry | null;
  activeProvider?: string;
  activeModel?: string;
};

export function EmbeddingModelsDetail({ entry, activeProvider, activeModel }: Props) {
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
                {formatModelLabel(model, activeProvider, activeModel)}
              </Text>
              {model.is_active ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  ({t('documents.embedding.currentModel')})
                </Text>
              ) : null}
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
