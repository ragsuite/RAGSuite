import type { LucideIcon } from 'lucide-react-native';
import { Play } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { formatDocumentIndexedDate } from '@/features/crawl/utils/document-form';
import { textualLanguageLabel } from '@/features/crawl/utils/textual-sources';
import {
  isTextualRetrain,
  joinModelLabels,
  resolveTextualTrainingState,
  textualStatusDisplay,
} from '@/features/crawl/utils/textual-training';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  document: CrawlDocument;
  icon: LucideIcon;
  typeLabel: string;
  /** Models the next training run embeds into. */
  targetModels: string[];
  /** Models that currently hold vectors for this source. */
  trainedModels: string[];
  loading: boolean;
  trainRequestPending: boolean;
  onTrain: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function TextualSourceCard({
  document,
  icon: Icon,
  typeLabel,
  targetModels,
  trainedModels,
  loading,
  trainRequestPending,
  onTrain,
  onEdit,
  onDelete,
}: Props) {
  const { colors, spacing, componentRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const name = document.title?.trim() || document.name;
  const state = resolveTextualTrainingState(document);
  const status = textualStatusDisplay(document);
  const training = state === 'training' || trainRequestPending;
  const hasVectors = document.chunksCount > 0 || state === 'trained';
  // Coverage can lag right after training; the configured targets are what that run used.
  const modelLabels = hasVectors && trainedModels.length > 0 ? trainedModels : targetModels;
  const unknownModel = t('crawl.textual.model.unknown');

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <View style={[styles.header, { gap: spacing.xs }]}>
        <Icon size={18} color={colors.primary} />
        <View style={[styles.badges, { gap: spacing.xxs }]}>
          <CrawlStatusBadge label={typeLabel} tone="fileType" preserveCase />
          <StatusBadge label={t(status.labelKey)} tone={status.tone} preserveCase />
        </View>
      </View>

      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.subtitle, styles.title, { color: colors.text }]} numberOfLines={2}>
          {name}
        </Text>
        {document.description ? (
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
            {document.description}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.xxs }}>
        <MetaRow
          label={t('crawl.textual.field.chunks')}
          value={hasVectors ? String(document.chunksCount) : '—'}
        />
        <MetaRow label={t('documents.fields.language')} value={textualLanguageLabel(document.language)} />
        <MetaRow
          label={hasVectors ? t('crawl.textual.field.trainedWith') : t('crawl.textual.field.willTrainWith')}
          value={joinModelLabels(modelLabels, unknownModel)}
        />
        <MetaRow
          label={t('crawl.textual.field.trainedAt')}
          value={hasVectors ? formatDocumentIndexedDate(document.indexedAt) : t('crawl.textual.field.notTrainedYet')}
        />
      </View>

      <View style={[styles.actions, { gap: spacing.xxs }]}>
        <AppButton
          label={
            training
              ? t('crawl.textual.status.training')
              : isTextualRetrain(document)
                ? t('crawl.textual.action.retrain')
                : t('crawl.textual.action.train')
          }
          accessibilityLabel={t('crawl.textual.a11y.train', { name })}
          icon={Play}
          variant={state === 'trained' ? 'outline' : 'cta'}
          size="compact"
          loading={training}
          disabled={training || loading}
          onPress={onTrain}
        />
        <View style={styles.spacer} />
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <AppButton
          label={t('common.edit')}
          accessibilityLabel={t('crawl.textual.a11y.edit', { name })}
          iconOnly
          icon={ActionIcons.edit}
          variant="ghost"
          size="compact"
          disabled={training || loading}
          onPress={onEdit}
        />
        <AppButton
          label={t('common.delete')}
          accessibilityLabel={t('crawl.textual.a11y.delete', { name })}
          iconOnly
          icon={ActionIcons.delete}
          variant="ghost"
          size="compact"
          disabled={loading}
          onPress={onDelete}
        />
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.metaRow}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.caption, styles.metaValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, flexGrow: 1, width: '100%', minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center' },
  badges: { marginLeft: 'auto', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  title: { fontSize: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaValue: { fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  spacer: { flex: 1 },
});
