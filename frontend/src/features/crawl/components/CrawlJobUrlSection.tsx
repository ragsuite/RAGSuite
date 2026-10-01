import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUpDown, ChevronDown, type LucideIcon } from 'lucide-react-native';

import { CrawlJobUrlRow } from '@/features/crawl/components/CrawlJobUrlRow';
import { useCrawlJobUrls } from '@/features/crawl/hooks/use-crawl-job-urls';
import type { CrawlJobUrlEntry, CrawlJobUrlKind } from '@/features/crawl/types/crawl.types';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  jobId: string;
  kind: CrawlJobUrlKind;
  title: string;
  /** Count shown in the header (run statistics). */
  headerTotal: number;
  /** First page of entries delivered with the job detail. */
  items: (string | CrawlJobUrlEntry)[];
  /** Entries available on the server for paging. */
  listTotal: number;
  icon?: LucideIcon;
  iconColor?: string;
  showReason?: boolean;
  showStatus?: boolean;
  showReferrers?: boolean;
  emptyMessage?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export function CrawlJobUrlSection({
  jobId,
  kind,
  title,
  headerTotal,
  items: initialItems,
  listTotal,
  icon: Icon,
  iconColor,
  showReason = false,
  showStatus = false,
  showReferrers = false,
  emptyMessage = 'None',
  collapsible = true,
  defaultExpanded = false,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(collapsible ? defaultExpanded : true);
  const urls = useCrawlJobUrls({ jobId, kind, initialItems, initialTotal: listTotal });
  const isOpen = collapsible ? expanded : true;
  const showControls = listTotal > 0 || urls.isSearching;
  const mutedCaption = [typography.caption, { color: colors.textMuted }];

  const footer = (
    <View style={[styles.footer, { gap: spacing.sm, paddingVertical: spacing.xs }]}>
      {urls.items.length > 0 && (urls.hasMore || urls.isSearching) ? (
        <Text style={[mutedCaption, styles.footerText]}>
          {t('crawl.jobs.urlList.showing', { visible: urls.items.length, total: urls.total })}
        </Text>
      ) : (
        <View style={styles.footerText} />
      )}
      {urls.loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      {!urls.loading && urls.failed ? (
        <Pressable accessibilityRole="button" onPress={urls.retry}>
          <Text style={[typography.caption, { color: colors.danger }]}>
            {t('crawl.error.loadFailed')} · {t('common.retry')}
          </Text>
        </Pressable>
      ) : null}
      {!urls.loading && !urls.failed && urls.hasMore ? (
        <Pressable
          accessibilityRole="button"
          onPress={urls.loadMore}
          style={[styles.chipButton, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
          <Text style={[typography.caption, styles.chipLabel, { color: colors.text }]}>
            {t('crawl.jobs.urlList.loadMore')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const listBody = (
    <View
      style={[
        styles.list,
        collapsible ? { borderTopColor: colors.border, borderTopWidth: 1 } : null,
        { paddingHorizontal: collapsible ? spacing.md : 0, paddingBottom: spacing.sm },
      ]}>
      {showControls ? (
        <View style={[styles.filterRow, { gap: spacing.xs, paddingVertical: spacing.xs }]}>
          <TextInput
            accessibilityLabel={t('crawl.jobs.referrerFilter.placeholder')}
            value={urls.query}
            onChangeText={urls.setQuery}
            placeholder={t('crawl.jobs.referrerFilter.placeholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[
              typography.caption,
              styles.filterInput,
              {
                borderColor: colors.border,
                borderRadius: surfaceRadius.input,
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
              },
            ]}
          />
          {showReferrers ? (
            <Pressable
              accessibilityRole="button"
              onPress={urls.toggleSort}
              style={[styles.chipButton, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
              <ArrowUpDown size={12} color={colors.textMuted} />
              <Text style={[typography.caption, styles.chipLabel, { color: colors.text }]}>
                {urls.sort === 'url' ? t('crawl.jobs.sortByUrl') : t('crawl.jobs.sortByReferrer')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {urls.items.length === 0 ? (
        urls.loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing.sm }} />
        ) : (
          <Text style={[mutedCaption, { paddingVertical: spacing.xs, paddingLeft: collapsible ? 0 : spacing.lg }]}>
            {urls.failed
              ? t('crawl.error.loadFailed')
              : urls.isSearching
                ? t('crawl.jobs.referrerFilter.noMatch')
                : emptyMessage}
          </Text>
        )
      ) : (
        <View
          style={[
            styles.urlListShell,
            { borderColor: colors.border, borderRadius: surfaceRadius.card, backgroundColor: colors.surface },
          ]}>
          <AppScrollView style={styles.urlScroll} nestedScrollEnabled>
            {urls.items.map((item, index) => (
              <CrawlJobUrlRow
                key={`${item.url}-${index}`}
                item={item}
                showReason={showReason}
                showStatus={showStatus}
                showReferrers={showReferrers}
              />
            ))}
          </AppScrollView>
        </View>
      )}
      {urls.items.length > 0 || urls.failed ? footer : null}
    </View>
  );

  if (!collapsible) {
    return (
      <View style={[styles.panelSection, { gap: spacing.sm }]}>
        <View style={styles.panelHeader}>
          {Icon ? <Icon size={16} color={iconColor ?? colors.textMuted} /> : null}
          <Text style={[typography.body, styles.title, { color: colors.text }]}>{title}</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]}>
            <Text style={[typography.caption, styles.chipLabel, { color: colors.textMuted }]}>{headerTotal}</Text>
          </View>
        </View>
        {listBody}
      </View>
    );
  }

  return (
    <View style={[styles.section, { borderColor: colors.border, borderRadius: surfaceRadius.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${title}, ${headerTotal} items`}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.header,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          },
        ]}>
        {Icon ? <Icon size={16} color={iconColor ?? colors.textMuted} /> : null}
        <Text style={[typography.body, styles.title, { color: colors.text }]}>
          {title} ({headerTotal})
        </Text>
        <ChevronDown
          size={16}
          color={colors.textMuted}
          style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {isOpen ? listBody : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelSection: {
    width: '100%',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontWeight: '500',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: {
    gap: 2,
  },
  filterRow: {
    gap: 8,
  },
  filterInput: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  chipLabel: {
    fontWeight: '500',
  },
  urlListShell: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  urlScroll: {
    maxHeight: 420,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    flex: 1,
  },
});
