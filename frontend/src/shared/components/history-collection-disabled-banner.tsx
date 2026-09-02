import React from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  messageKey: string;
};

export function HistoryCollectionDisabledBanner({ messageKey }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.warning,
        backgroundColor: colors.surfaceMuted,
        borderRadius: surfaceRadius.card,
        padding: spacing.md,
      }}
    >
      <Text style={[typography.body, { color: colors.text, lineHeight: 20 }]}>{t(messageKey)}</Text>
    </View>
  );
}
