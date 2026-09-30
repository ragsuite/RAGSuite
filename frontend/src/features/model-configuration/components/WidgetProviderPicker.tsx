import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { hrefForAppRoute } from '@/config/navigation';
import { ReadOnlyModelTag } from '@/features/model-configuration/components/ReadOnlyModelTag';
import type { ModelProviderKey, ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import type { UnavailableWidgetProvider } from '@/features/model-configuration/utils/widget-provider-selection';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  configured: ProviderCatalogEntry[];
  selected: ProviderCatalogEntry;
  /** Embedding model shown for chat-only providers (the widget keeps its own). */
  embeddingModel: string;
  labels: { provider: string; chatModel: string; embeddingModel: string };
  /** The widget's saved provider when it can no longer be used; nothing changes until Save. */
  unavailable?: UnavailableWidgetProvider | null;
  onChange: (provider: ModelProviderKey) => void;
};

function modelLabel(options: { key: string; label: string }[], key: string): string {
  return options.find((m) => m.key === key)?.label || key;
}

/** Widget model settings: pick a configured provider; its models are read-only here. */
export function WidgetProviderPicker({ configured, selected, embeddingModel, labels, unavailable, onChange }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useAppTheme();
  const { config } = selected;
  const embeddingValue = config.embeddingModel || embeddingModel;
  return (
    <View style={{ gap: spacing.md }}>
      {unavailable ? (
        <FormErrorBanner
          message={t(`models.widgetProviderUnavailable.${unavailable.reason}`, {
            provider: unavailable.label,
            fallback: selected.label,
          })}
        />
      ) : null}
      <AppSelectField
        label={labels.provider}
        value={selected.key}
        options={configured.map((p) => ({ key: p.key, label: p.label }))}
        onChange={(key) => onChange(key as ModelProviderKey)}
      />

      <View style={[styles.tagRow, { gap: spacing.lg }]}>
        <ReadOnlyModelTag
          label={labels.chatModel}
          value={config.chatModel ? modelLabel(selected.chatModels, config.chatModel) : ''}
          emptyLabel={t('chatbot.models.chatModel.noneAvailable')}
        />
        <ReadOnlyModelTag
          label={labels.embeddingModel}
          value={embeddingValue ? modelLabel(selected.embeddingModels, embeddingValue) : ''}
          emptyLabel={t('chatbot.models.embeddingModel.noneAvailable')}
        />
      </View>

      <View style={[styles.hintRow, { gap: spacing.sm }]}>
        <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>
          {t('models.fromModelConfiguration.hint')}
        </Text>
        <AppButton
          variant="outline"
          size="compact"
          label={t('models.manageProviders')}
          onPress={() => router.push(hrefForAppRoute('model-configuration'))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  hintRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  hint: { flex: 1, minWidth: 200, lineHeight: 18 },
});
