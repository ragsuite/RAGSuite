import React from 'react';
import { Text, View } from 'react-native';

import type { ModelProvider } from '@/features/search-config/types/search-config.types';
import {
  getProviderEgressNotice,
  type ProviderEgressLevel,
} from '@/features/search-config/utils/provider-egress-metadata';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  provider: ModelProvider | string;
};

function toneColors(level: ProviderEgressLevel, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (level === 'none') return { border: colors.border, bg: colors.surfaceMuted, text: colors.textSoft };
  if (level === 'eu') return { border: colors.primary, bg: colors.primaryTint, text: colors.text };
  return { border: colors.warning, bg: colors.surfaceMuted, text: colors.text };
}

export function LlmEgressWarningBanner({ provider }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const notice = getProviderEgressNotice(provider);
  if (!notice) return null;
  const tone = toneColors(notice.level, colors);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.bg,
        borderRadius: surfaceRadius.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}>
      <Text style={[typography.caption, { color: colors.primary }]}>
        {t('compliance.llmEgress.title', { defaultValue: 'Data egress notice' })}
      </Text>
      <Text style={[typography.body, { color: tone.text, lineHeight: 20 }]}>
        {t(notice.messageKey, { defaultValue: notice.defaultMessage })}
      </Text>
    </View>
  );
}
