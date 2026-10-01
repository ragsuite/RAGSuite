import React, { memo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CrawlJobUrlEntry } from '@/features/crawl/types/crawl.types';
import { friendlyCrawlReason } from '@/features/crawl/utils/friendly-crawl-reason';
import { NavGroupLabel } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

const INLINE_REFERRER_LIMIT = 3;

function openUrl(url: string) {
  void Linking.openURL(url);
}

function ReferrerLinks({ referrers, truncated }: { referrers: string[]; truncated?: boolean }) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  if (referrers.length === 0) return null;

  const visible = expanded ? referrers : referrers.slice(0, INLINE_REFERRER_LIMIT);
  const hiddenCount = referrers.length - INLINE_REFERRER_LIMIT;

  return (
    <View style={styles.referrerBlock}>
      <NavGroupLabel style={[styles.referrerLabel, { color: colors.textMuted }]}>
        {t('crawl.jobs.foundOn')}
      </NavGroupLabel>
      {visible.map((ref) => (
        <Pressable key={ref} accessibilityRole="link" onPress={() => openUrl(ref)}>
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
      {truncated ? (
        <Text style={[typography.caption, styles.truncated, { color: colors.textMuted }]}>…</Text>
      ) : null}
    </View>
  );
}

type Props = {
  item: CrawlJobUrlEntry;
  showReason?: boolean;
  showStatus?: boolean;
  showReferrers?: boolean;
};

function CrawlJobUrlRowComponent({ item, showReason, showStatus, showReferrers }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View
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
        <Text style={[typography.caption, styles.urlText, { color: colors.primary }]} selectable>
          {item.url}
        </Text>
        <View style={styles.externalIcon}>
          <ActionIcons.externalLink size={14} color={colors.textMuted} />
        </View>
      </Pressable>
      {showReason && item.reason ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {friendlyCrawlReason(item.reason, t)}
        </Text>
      ) : null}
      {showStatus && item.status_code ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>HTTP {item.status_code}</Text>
      ) : null}
      {showReferrers ? (
        <ReferrerLinks referrers={item.referrers ?? []} truncated={item.referrers_truncated} />
      ) : null}
    </View>
  );
}

export const CrawlJobUrlRow = memo(CrawlJobUrlRowComponent);

const styles = StyleSheet.create({
  item: {
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  urlText: {
    flex: 1,
    minWidth: 0,
  },
  externalIcon: {
    flexShrink: 0,
    paddingTop: 1,
  },
  referrerBlock: {
    gap: 2,
    paddingLeft: 4,
  },
  referrerLabel: {
    fontSize: 10,
  },
  truncated: {
    fontStyle: 'italic',
  },
});
