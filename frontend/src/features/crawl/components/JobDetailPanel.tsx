import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { X } from 'lucide-react-native';

import { JobDetailContent } from '@/features/crawl/components/JobDetailContent';
import { EmbeddingCoverageWarningIcon } from '@/features/crawl/components/EmbeddingCoverageWarningIcon';
import type { CrawlJob } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  job: CrawlJob;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  onClose: () => void;
};

export function JobDetailPanel({ job, coverageEntry, onClose }: Props) {
  const { colors, spacing, componentRadius, typography, elevation } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.panel,
        elevation.card,
        {
          borderColor: colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
        },
      ]}>
      <View style={[styles.header, { borderBottomColor: colors.border, padding: spacing.md }]}>
        <View style={styles.titleRow}>
          <Text style={[typography.subtitle, { color: colors.text, flex: 1 }]} numberOfLines={2}>
            {job.name}
          </Text>
          <EmbeddingCoverageWarningIcon entry={coverageEntry} size={18} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('crawl.jobs.detail.closeA11y')}
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [
            styles.closeBtn,
            {
              borderRadius: componentRadius.button,
              opacity: pressed ? 0.7 : 1,
              backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            },
          ]}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <AppScrollView style={styles.body} contentContainerStyle={{ padding: spacing.md }}>
        <JobDetailContent job={job} coverageEntry={coverageEntry} />
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 360,
    maxWidth: '100%',
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 640,
    minHeight: 320,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    gap: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  closeBtn: {
    width: CRAWL_MOBILE_TOUCH_MIN,
    height: CRAWL_MOBILE_TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
});
