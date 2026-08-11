import React from 'react';
import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  entry?: ItemEmbeddingCoverageEntry | null;
  size?: number;
};

export function EmbeddingCoverageWarningIcon({ entry, size = 16 }: Props) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  if (!entry?.missing_active) return null;

  return (
    <View accessibilityLabel={t('documents.embedding.missingActiveA11y')}>
      <AlertTriangle size={size} color={colors.warning} />
    </View>
  );
}
