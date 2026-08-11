import { Eye, FileText } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { EmbeddingCoverageWarningIcon } from '@/features/crawl/components/EmbeddingCoverageWarningIcon';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import {
  formatDocumentIndexedDate,
  formatDocumentMimeBadge,
  resolveDocumentStatusLabel,
} from '@/features/crawl/utils/document-form';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import { useTranslation } from '@/i18n';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  document: CrawlDocument;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function CrawlDocumentCard({
  document,
  coverageEntry,
  selected,
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
}: Props) {
  const { colors, spacing, componentRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const displayName = document.title?.trim() || document.name;
  const statusTone =
    document.status === 'failed' ? 'danger' : document.status === 'indexed' ? 'default' : 'muted';

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={t('documents.a11y.selectDocument', { name: displayName })}
          hitSlop={10}
          onPress={onToggleSelect}>
          <AppCheckboxMark checked={selected} size={22} />
        </Pressable>
        <FileText size={18} color={colors.primary} />
        <View style={styles.badgeGroup}>
          <EmbeddingCoverageWarningIcon entry={coverageEntry} />
          <CrawlStatusBadge label={formatDocumentMimeBadge(document.mimeType)} tone="fileType" preserveCase />
          <CrawlStatusBadge
            label={resolveDocumentStatusLabel(document, coverageEntry)}
            tone={statusTone}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('documents.a11y.openDocument', { name: displayName })}
        onPress={onView}
        style={({ pressed, hovered }) => [
          styles.body,
          {
            opacity: pressed ? 0.96 : 1,
            backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
            borderRadius: componentRadius.card,
          },
        ]}>
        <Text style={[typography.subtitle, { color: colors.text, fontSize: 16 }]} numberOfLines={2}>
          {displayName}
        </Text>

        <View style={styles.meta}>
          <MetaRow label={t('documents.fields.type')} value={formatDocumentMimeBadge(document.mimeType)} />
          <MetaRow label={t('documents.fields.size')} value={`${document.sizeKb} KB`} />
          <MetaRow label={t('documents.fields.source')} value={document.sourceLabel} />
          <MetaRow label={t('documents.fields.language')} value={document.language} />
          <MetaRow label={t('documents.fields.indexed')} value={formatDocumentIndexedDate(document.indexedAt)} />
        </View>
      </Pressable>

      <View style={styles.actions}>
        <IconAction icon={Eye} label={t('crawl.action.viewDocument')} onPress={onView} />
        <IconAction icon={ActionIcons.edit} label={t('crawl.action.editDocument')} onPress={onEdit} />
        <IconAction icon={ActionIcons.delete} label={t('crawl.action.deleteDocument')} onPress={onDelete} destructive />
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.metaRow}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function IconAction({
  icon: Icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors, componentRadius } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.iconAction,
        {
          minWidth: CRAWL_MOBILE_TOUCH_MIN,
          minHeight: CRAWL_MOBILE_TOUCH_MIN,
          borderRadius: componentRadius.button,
          backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
        },
      ]}>
      <Icon size={16} color={destructive ? colors.danger : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    flexGrow: 1,
    width: '100%',
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    gap: 8,
  },
  badgeGroup: {
    marginLeft: 'auto',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  meta: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  iconAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
