import { FileText } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { EmbeddingCoverageWarningIcon } from '@/features/crawl/components/EmbeddingCoverageWarningIcon';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { CRAWL_MOBILE_TOUCH_MIN, useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { CRAWL_DOCUMENT_LIST } from '@/features/crawl/utils/crawl-layout';
import {
  formatDocumentChunkLabel,
  formatDocumentMimeBadge,
  resolveDocumentStatusLabel,
} from '@/features/crawl/utils/document-form';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  selected: boolean;
  isLast?: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
};

export function CrawlDocumentListRow({
  document,
  coverageEntry,
  selected,
  isLast,
  onToggleSelect,
  onPress,
}: Props) {
  const { colors, spacing, componentRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const isCompact = useCrawlCompactLayout();
  const displayName = document.title?.trim() || document.name;
  const statusTone =
    document.status === 'failed' ? 'danger' : document.status === 'indexed' ? 'default' : 'muted';
  const statusLabel = resolveDocumentStatusLabel(document, coverageEntry);
  const mimeLabel = formatDocumentMimeBadge(document.mimeType);
  const metaLine = `${formatDocumentChunkLabel(document.chunksCount)} · ${document.sizeKb} KB`;

  const checkbox = (align: 'center' | 'flex-start' = 'center') => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t('documents.a11y.selectDocument', { name: displayName })}
      hitSlop={10}
      onPress={onToggleSelect}
      style={{
        alignSelf: align,
        marginTop: align === 'flex-start' ? 2 : 0,
      }}>
      <AppCheckboxMark checked={selected} />
    </Pressable>
  );

  if (isCompact) {
    return (
      <View
        style={[
          styles.mobileRow,
          {
            borderBottomColor: colors.border,
            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
            backgroundColor: colors.surface,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.sm,
            gap: spacing.sm,
          },
        ]}>
        {checkbox('flex-start')}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('documents.a11y.openDocument', { name: displayName })}
          onPress={onPress}
          style={({ pressed, hovered }) => [
            styles.mobileMain,
            {
              backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
              borderRadius: componentRadius.card,
            },
          ]}>
          <View style={styles.mobileTop}>
            <FileText size={18} color={colors.primary} />
            <View style={styles.mobileIdentity}>
              <Text
                style={[typography.body, { color: colors.text, fontWeight: '500', lineHeight: 20 }]}
                numberOfLines={2}>
                {displayName}
              </Text>
              {document.name && document.name !== displayName ? (
                <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]} numberOfLines={1}>
                  {document.name}
                </Text>
              ) : null}
            </View>
            <EmbeddingCoverageWarningIcon entry={coverageEntry} />
          </View>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {metaLine}
          </Text>
          <View style={styles.mobileBadges}>
            <CrawlStatusBadge label={mimeLabel} tone="fileType" preserveCase />
            <CrawlStatusBadge label={statusLabel} tone={statusTone} />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
          backgroundColor: colors.surface,
          paddingLeft: spacing.md,
          paddingRight: spacing.md,
          gap: CRAWL_DOCUMENT_LIST.rowGap,
        },
      ]}>
      {checkbox()}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('documents.a11y.openDocument', { name: displayName })}
        onPress={onPress}
        style={({ pressed, hovered }) => [
          styles.content,
          { backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent' },
        ]}>
        <FileText size={CRAWL_DOCUMENT_LIST.iconWidth} color={colors.primary} />

        <View style={styles.titleCol}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {document.name}
          </Text>
        </View>

        <View style={styles.metaCol}>
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {formatDocumentChunkLabel(document.chunksCount)}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {document.sizeKb} KB
          </Text>
        </View>

        <View style={styles.badges}>
          <EmbeddingCoverageWarningIcon entry={coverageEntry} />
          <CrawlStatusBadge label={mimeLabel} tone="fileType" preserveCase />
          <CrawlStatusBadge label={statusLabel} tone={statusTone} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: CRAWL_MOBILE_TOUCH_MIN + 16,
  },
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mobileMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 2,
  },
  mobileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  mobileIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mobileBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CRAWL_DOCUMENT_LIST.rowGap,
    paddingVertical: 14,
    minWidth: 0,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaCol: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: CRAWL_DOCUMENT_LIST.metaMinWidth,
    flexShrink: 0,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    minWidth: CRAWL_DOCUMENT_LIST.badgesMinWidth,
    maxWidth: 220,
    flexShrink: 0,
  },
});
