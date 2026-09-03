import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { ArrowUpDown, ChevronDown, type LucideIcon } from 'lucide-react-native';

import type { CrawlJobUrlEntry } from '@/features/crawl/types/crawl.types';
import { friendlyCrawlReason } from '@/features/crawl/utils/friendly-crawl-reason';
import { NavGroupLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type UrlItem = string | CrawlJobUrlEntry;

type Props = {
  title: string;
  count: number;
  total?: number;
  items: UrlItem[];
  icon?: LucideIcon;
  iconColor?: string;
  showReason?: boolean;
  showStatus?: boolean;
  showReferrers?: boolean;
  emptyMessage?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

const INLINE_REFERRER_LIMIT = 3;

type SortMode = 'url' | 'referrer';

function normalizeItem(item: UrlItem): CrawlJobUrlEntry {
  if (typeof item === 'string') return { url: item };
  return item;
}

function ReferrerLinks({
  referrers,
  truncated,
}: {
  referrers: string[];
  truncated?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  if (referrers.length === 0) return null;

  const visible = expanded ? referrers : referrers.slice(0, INLINE_REFERRER_LIMIT);
  const hiddenCount = referrers.length - INLINE_REFERRER_LIMIT;

  return (
    <View style={styles.referrerBlock}>
      <NavGroupLabel style={{ color: colors.textMuted, fontSize: 10 }}>
        {t('crawl.jobs.foundOn')}
      </NavGroupLabel>
      {visible.map((ref) => (
        <Pressable key={ref} accessibilityRole="link" onPress={() => void Linking.openURL(ref)}>
          <Text style={[typography.caption, { color: colors.primary }]} selectable>
            {ref}
          </Text>
        </Pressable>
      ))}
      {!expanded && hiddenCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(true)}>
          <Text style={[typography.caption, { color: colors.primary }]}>
            {t('crawl.jobs.referrersMore', { count: hiddenCount })}
          </Text>
        </Pressable>
      ) : null}
      {truncated ? <Text style={[typography.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>…</Text> : null}
    </View>
  );
}

export function CrawlJobUrlSection({
  title,
  count,
  total,
  items,
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
  const [referrerFilter, setReferrerFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('url');
  const displayTotal = total ?? count;
  const isOpen = collapsible ? expanded : true;

  const normalizedItems = useMemo(() => items.map(normalizeItem), [items]);

  const displayedItems = useMemo(() => {
    let result = [...normalizedItems];
    const query = referrerFilter.trim().toLowerCase();
    if (query) {
      result = result.filter((entry) =>
        (entry.referrers ?? []).some((ref) => ref.toLowerCase().includes(query)),
      );
    }
    result.sort((a, b) => {
      if (sortMode === 'referrer') {
        const aRef = (a.referrers ?? [])[0] ?? '';
        const bRef = (b.referrers ?? [])[0] ?? '';
        return aRef.localeCompare(bRef) || a.url.localeCompare(b.url);
      }
      return a.url.localeCompare(b.url);
    });
    return result;
  }, [normalizedItems, referrerFilter, sortMode]);

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  const listBody = (
    <View
      style={[
        styles.list,
        collapsible ? { borderTopColor: colors.border, borderTopWidth: 1 } : null,
        { paddingHorizontal: collapsible ? spacing.md : 0, paddingBottom: spacing.sm },
      ]}>
      {showReferrers && normalizedItems.length > 0 ? (
        <View style={[styles.filterRow, { gap: spacing.xs, paddingVertical: spacing.xs }]}>
          <TextInput
            accessibilityLabel={t('crawl.jobs.referrerFilter.placeholder')}
            value={referrerFilter}
            onChangeText={setReferrerFilter}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => setSortMode((mode) => (mode === 'url' ? 'referrer' : 'url'))}
            style={[styles.sortButton, { borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
            <ArrowUpDown size={12} color={colors.textMuted} />
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
              {sortMode === 'url' ? t('crawl.jobs.sortByUrl') : t('crawl.jobs.sortByReferrer')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {displayedItems.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted, paddingVertical: spacing.xs, paddingLeft: collapsible ? 0 : spacing.lg }]}>
          {referrerFilter.trim() ? t('crawl.jobs.referrerFilter.noMatch') : emptyMessage}
        </Text>
      ) : (
        <View
          style={[
            styles.urlListShell,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surface,
            },
          ]}>
          <AppScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
            {displayedItems.map((item, index) => (
              <View
                key={`${item.url}-${index}`}
                style={[
                  styles.item,
                  {
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderBottomColor: colors.border,
                  },
                ]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${item.url}`}
                  onPress={() => openUrl(item.url)}
                  style={styles.urlRow}>
                  <Text style={[typography.caption, { color: colors.primary, flex: 1, minWidth: 0 }]} selectable>
                    {item.url}
                  </Text>
                  <View style={styles.externalIcon}>
                    <ActionIcons.externalLink size={14} color={colors.textMuted} />
                  </View>
                </Pressable>
                {showReason && item.reason ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {friendlyCrawlReason(item.reason)}
                  </Text>
                ) : null}
                {showStatus && item.status_code ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>HTTP {item.status_code}</Text>
                ) : null}
                {showReferrers ? (
                  <ReferrerLinks referrers={item.referrers ?? []} truncated={item.referrers_truncated} />
                ) : null}
              </View>
            ))}
          </AppScrollView>
        </View>
      )}
    </View>
  );

  if (!collapsible) {
    return (
      <View style={[styles.panelSection, { gap: spacing.sm }]}>
        <View style={styles.panelHeader}>
          {Icon ? <Icon size={16} color={iconColor ?? colors.textMuted} /> : null}
          <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]}>{title}</Text>
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]}>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>{displayTotal}</Text>
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
        accessibilityLabel={`${title}, ${displayTotal} items`}
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
        <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]}>
          {title} ({displayTotal})
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
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  urlListShell: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  item: {
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  externalIcon: {
    flexShrink: 0,
    paddingTop: 1,
  },
  referrerBlock: {
    gap: 2,
    paddingLeft: 4,
  },
});
