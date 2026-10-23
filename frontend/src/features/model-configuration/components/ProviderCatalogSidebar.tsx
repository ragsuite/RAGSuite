import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, ExternalLink } from 'lucide-react-native';

import { CrawlSearchField } from '@/features/crawl/components/CrawlSearchField';
import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { markForProvider } from '@/features/model-configuration/components/provider-marks';
import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';
import type { ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import {
  KIND_FILTERS,
  countProvidersByKind,
  providerHasKind,
  visibleCatalogProviders,
  type KindFilter,
} from '@/features/model-configuration/utils/provider-catalog';
import { useTranslation } from '@/i18n';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  providers: ProviderCatalogEntry[];
  activeProvider: ModelProviderKey;
  kindFilter: KindFilter;
  search: string;
  fillHeight?: boolean;
  onSearch: (value: string) => void;
  onFilter: (filter: KindFilter) => void;
  onSelect: (provider: ModelProviderKey) => void;
};

export function ProviderCatalogSidebar({
  providers,
  activeProvider,
  kindFilter,
  search,
  fillHeight = false,
  onSearch,
  onFilter,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const searched = visibleCatalogProviders(providers, 'all', search);
  const counts = countProvidersByKind(searched);
  const visible = kindFilter === 'all' ? searched : searched.filter((entry) => providerHasKind(entry, kindFilter));

  return (
    <View style={[styles.root, fillHeight ? styles.fill : null, { gap: spacing.sm }]}>
      <View style={[styles.header, { gap: spacing.sm }]}>
        <CrawlSearchField
          value={search}
          onChangeText={onSearch}
          placeholder={t('modelConfiguration.search.placeholder')}
          accessibilityLabel={t('modelConfiguration.search.placeholder')}
        />
        <CrawlSegmentTabs
          tabs={KIND_FILTERS.map((key) => ({
            key,
            label: `${t(`modelConfiguration.filter.${key}`)} ${counts[key]}`,
          }))}
          activeTab={kindFilter}
          onChange={onFilter}
          variant="secondary"
          appearance="pill"
          showScrollbar
        />
      </View>
      <View style={[styles.list, fillHeight ? styles.listFill : null, { borderColor: colors.border, borderRadius: surfaceRadius.card }]}>
        <AppScrollView
          nestedScrollEnabled
          style={fillHeight ? styles.listScroll : undefined}
          keyboardShouldPersistTaps="handled">
          {visible.length === 0 ? (
            <Text style={[typography.body, styles.empty, { color: colors.textMuted }]}>{t('modelConfiguration.empty')}</Text>
          ) : null}
          {visible.map((entry) => {
            const selected = entry.key === activeProvider;
            const Mark = markForProvider(entry.key);
            return (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(entry.key)}
                style={({ pressed, hovered }) => [
                  styles.row,
                  Platform.OS === 'web'
                    ? ({ cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms' } as object)
                    : null,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: selected
                      ? colors.surfaceMuted
                      : pressed || hovered
                        ? colors.surfaceHover
                        : colors.surface,
                  },
                ]}>
                <View style={styles.rowHead}>
                  <Mark size={18} color={colors.text} />
                  <Text style={[typography.headingSemibold, styles.label, { color: colors.text }]} numberOfLines={1}>
                    {entry.label}
                  </Text>
                  {entry.docsUrl ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={entry.docsUrl}
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        void Linking.openURL(entry.docsUrl!);
                      }}>
                      <ExternalLink size={14} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                  {entry.config.configured ? <CheckCircle2 size={16} color={colors.success} /> : null}
                </View>
                <View style={styles.chips}>
                  {(entry.kinds ?? []).map((kind) => (
                    <Text
                      key={kind}
                      style={[
                        typography.caption,
                        styles.chip,
                        { color: colors.textMuted, borderColor: colors.border, backgroundColor: colors.background },
                      ]}>
                      {t(`modelConfiguration.filter.${kind}`)}
                    </Text>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </AppScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  fill: { flex: 1, minHeight: 0 },
  header: { flexGrow: 0, flexShrink: 0 },
  list: { borderWidth: 1, overflow: 'hidden' },
  listFill: { flex: 1, minHeight: 0 },
  listScroll: { flex: 1, minHeight: 0 },
  empty: { padding: 12 },
  row: { borderBottomWidth: 1, padding: 12, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
});
