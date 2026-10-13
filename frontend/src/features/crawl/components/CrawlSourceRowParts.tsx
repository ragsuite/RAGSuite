import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';

import { CrawlEmbeddingCoverageWarningIcon } from '@/features/crawl/components/CrawlEmbeddingCoverageWarningIcon';
import type {
  CrawlEmbeddingTargetOptions,
  CrawlMenuAnchor,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { formatRelativeTime, formatShortDate, sourceIsTrained } from '@/features/crawl/utils/crawl.utils';
import { useTranslation } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type IdentityProps = {
  source: CrawlSource;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  embeddingOptions?: CrawlEmbeddingTargetOptions | null;
  showCoverageWarning: boolean;
};

export function SourceIdentity({ source, coverageEntry, embeddingOptions, showCoverageWarning }: IdentityProps) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.stack}>
      <View style={styles.inlineRow}>
        <Text style={[typography.body, styles.grow, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
          {source.name || t('crawl.table.unnamed')}
        </Text>
        {showCoverageWarning ? (
          <CrawlEmbeddingCoverageWarningIcon source={source} entry={coverageEntry} embeddingOptions={embeddingOptions} />
        ) : null}
      </View>
      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
        {source.base_url || t('crawl.table.noUrl')}
      </Text>
    </View>
  );
}

export function ModelLabelStack({ labels, trained }: { labels: string[]; trained: boolean }) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const shown = labels.length > 0
    ? labels
    : [trained ? t('crawl.table.model.unknown') : t('crawl.table.model.pending')];
  return (
    <View style={styles.stack}>
      {shown.map((label, index) => (
        <Text
          key={`${label}-${index}`}
          style={[typography.caption, { color: colors.text, fontWeight: '500' }]}
          numberOfLines={2}
          ellipsizeMode="tail">
          {label}
        </Text>
      ))}
    </View>
  );
}

/** Retrain schedule with depth and wait-for-load folded into one caption. */
export function CrawlSettingsSummary({ source }: { source: CrawlSource }) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.stack}>
      <Text style={[typography.caption, styles.preserveCase, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {source.cadence}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
        {t('crawl.table.crawlMeta', { depth: source.depth, waitForLoad: source.headless_mode || 'AUTO' })}
      </Text>
    </View>
  );
}

/** Trained / pending state with the last training time underneath. */
export function TrainingSummary({ source }: { source: CrawlSource }) {
  const { t, locale } = useTranslation();
  const { colors, typography } = useAppTheme();
  const trained = sourceIsTrained(source);
  const lastTrained = formatRelativeTime(source.last_crawl_at, t);
  return (
    <View style={styles.stack}>
      <View style={styles.inlineRow}>
        {trained ? <CheckCircle2 size={14} color={colors.success} /> : <Clock size={14} color={colors.warning} />}
        <Text style={[typography.caption, { color: trained ? colors.success : colors.textMuted, fontWeight: '500' }]}>
          {trained ? t('crawl.table.training.trained') : t('crawl.table.training.pending')}
        </Text>
      </View>
      <Text
        style={[typography.caption, { color: colors.textMuted }]}
        numberOfLines={1}
        accessibilityLabel={trained ? `${lastTrained} (${formatShortDate(source.trained_at, locale)})` : lastTrained}>
        {lastTrained}
      </Text>
    </View>
  );
}

type MenuProps = {
  sourceName: string;
  size: { width: number; height: number };
  radius: number;
  onOpenMenu: (anchor?: CrawlMenuAnchor) => void;
};

export function SourceMenuButton({ sourceName, size, radius, onOpenMenu }: MenuProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const anchorRef = useRef<View>(null);
  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('crawl.table.row.moreActionsA11y', { name: sourceName })}
        accessibilityHint={t('crawl.table.row.moreActionsHint')}
        hitSlop={8}
        onPress={(event) => {
          event?.stopPropagation?.();
          anchorRef.current?.measureInWindow((left, top, width, height) => {
            onOpenMenu({ top, left, width, height });
          });
        }}
        style={({ pressed, hovered }) => [
          styles.menuButton,
          {
            ...size,
            borderRadius: radius,
            backgroundColor: pressed || hovered ? colors.surfaceMuted : 'transparent',
          },
        ]}>
        <ActionIcons.more size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 2,
    minWidth: 0,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  grow: {
    flex: 1,
  },
  preserveCase: {
    textTransform: 'none',
  },
  menuButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
