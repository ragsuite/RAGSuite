import { Eye, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import {
    formatDocumentIndexedDate,
    formatDocumentMimeBadge,
    formatDocumentStatusLabel,
} from '@/features/crawl/utils/document-form';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  saving: boolean;
  onClose: () => void;
  onInspect: () => void;
  onOpen: () => void;
  onReindex: () => void;
  onDelete: () => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={[typography.caption, { color: colors.textMuted, minWidth: 118 }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text, flex: 1 }]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function DocumentDetailPanel({
  document,
  saving,
  onClose,
  onInspect,
  onOpen,
  onReindex,
  onDelete,
}: Props) {
  const { colors, spacing, componentRadius, typography, elevation } = useAppTheme();
  const { t } = useTranslation();
  const displayTitle = document.title?.trim() || document.name;
  const statusTone =
    document.status === 'failed' ? 'danger' : document.status === 'indexed' ? 'default' : 'muted';

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
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.headingSemibold, { color: colors.text }]}>{t('documents.details.title')}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('documents.details.description')}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('documents.details.closeA11y')}
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

      <AppScrollView style={styles.body} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
        <Text style={[typography.headingSemibold, { color: colors.text }]} numberOfLines={2}>
          {displayTitle}
        </Text>
        <View style={styles.badges}>
          <CrawlStatusBadge label={formatDocumentMimeBadge(document.mimeType)} tone="fileType" preserveCase />
          <CrawlStatusBadge label={formatDocumentStatusLabel(document.status)} tone={statusTone} />
        </View>

        {document.description ? <DetailRow label={t('documents.details.descriptionField')} value={document.description} /> : null}
        <DetailRow label={t('documents.details.sourceDomain')} value={document.sourceLabel} />
        <DetailRow label={t('documents.fields.language')} value={document.language} />
        <DetailRow label={t('documents.details.fileSize')} value={`${document.sizeKb} KB`} />
        <DetailRow label={t('documents.details.checksum')} value={document.checksum} />
        <DetailRow label={t('documents.details.chunks')} value={t('documents.details.chunksCreated', { count: document.chunksCount })} />
        <DetailRow label={t('documents.details.lastIndexed')} value={formatDocumentIndexedDate(document.indexedAt)} />

        {document.embeddedModels.length > 0 ? (
          <View style={{ gap: 6, paddingTop: 4 }}>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>{t('documents.embedding.modelsLabel')}</Text>
            {document.embeddedModels.map((model) => (
              <Text key={model} style={[typography.body, { color: colors.text }]}>
                {model}
              </Text>
            ))}
          </View>
        ) : null}
      </AppScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, padding: spacing.md, gap: spacing.xs }]}>
        <ConfigurationOutlineButton label={t('documents.inspector.title')} onPress={onInspect} icon={Eye} />
        <ConfigurationOutlineButton label={t('documents.inspector.open')} onPress={onOpen} />
        <ConfigurationOutlineButton label={t('documents.bulk.reindex')} loading={saving} onPress={onReindex} />
        <ConfigurationOutlineButton label={t('common.delete')} onPress={onDelete} />
      </View>
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
  },
});
