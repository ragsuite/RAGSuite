import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  CrawlEmbeddingProviderOption,
  CrawlEmbeddingTargetOptions,
  CrawlIngestEmbeddingTarget,
  CrawlProviderIngestTarget,
} from '@/features/crawl/types/crawl.types';
import {
  providerUsedByKey,
  type SourceEmbeddingMessages,
} from '@/features/crawl/utils/crawl-source-embedding-form';
import { NoConfiguredProvidersCta } from '@/features/model-configuration/components/NoConfiguredProvidersCta';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  loading: boolean;
  failed: boolean;
  options: CrawlEmbeddingTargetOptions | null;
  selected: CrawlIngestEmbeddingTarget | undefined;
  messages: SourceEmbeddingMessages;
  /** Overrides the default crawl-source helper line. */
  helper?: string;
  onSelect: (provider: CrawlProviderIngestTarget) => void;
  onOpenModelConfiguration?: () => void;
};

/** Indexing model radio list: providers configured in Model Configuration with a working key. */
export function EmbeddingProviderPicker({
  loading,
  failed,
  options,
  selected,
  messages,
  helper,
  onSelect,
  onOpenModelConfiguration,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  const body = (() => {
    if (loading) {
      return (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('crawl.form.embeddingTarget.loading')}
        </Text>
      );
    }
    if (failed || !options) {
      return (
        <Text style={[typography.caption, { color: colors.danger }]}>
          {t('crawl.form.embeddingTarget.loadFailed')}
        </Text>
      );
    }
    if (options.providers.length === 0) {
      return <NoConfiguredProvidersCta onNavigate={onOpenModelConfiguration} />;
    }
    return (
      <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        {options.providers.map((option) => (
          <ProviderOptionRow
            key={option.provider}
            option={option}
            selected={selected === option.provider}
            onPress={() => onSelect(option.provider)}
          />
        ))}
      </View>
    );
  })();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>
          {t('crawl.form.embeddingTarget.label')}
        </Text>
        <Text style={[typography.caption, styles.caption, { color: colors.textMuted }]}>
          {helper ?? t('crawl.form.embeddingTarget.helper')}
        </Text>
      </View>
      {body}
      {messages.info ? (
        <Text style={[typography.caption, styles.caption, { color: colors.textMuted }]}>
          {messages.info}
        </Text>
      ) : null}
      {messages.warning ? (
        <Text style={[typography.caption, styles.caption, { color: colors.warning }]}>
          {messages.warning}
        </Text>
      ) : null}
    </View>
  );
}

function ProviderOptionRow({
  option,
  selected,
  onPress,
}: {
  option: CrawlEmbeddingProviderOption;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const usedByLabel = t(providerUsedByKey(option.used_by));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${option.label}, ${option.model}. ${usedByLabel}`}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.option,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: surfaceRadius.input,
          backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
          padding: spacing.sm,
          gap: spacing.xxs,
        },
      ]}>
      <View style={[styles.header, { gap: spacing.xs }]}>
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : colors.surface,
            },
          ]}
        />
        <Text style={[typography.fieldLabel, styles.label, { color: colors.text }]}>{option.label}</Text>
      </View>
      <Text style={[typography.caption, styles.caption, { color: colors.text }]} numberOfLines={1}>
        {option.model}
      </Text>
      <Text style={[typography.caption, styles.caption, { color: colors.textMuted }]}>{usedByLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
  },
  caption: {
    lineHeight: 18,
  },
});
