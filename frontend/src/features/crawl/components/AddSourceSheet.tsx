import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { EmbeddingProviderPicker } from '@/features/crawl/components/EmbeddingProviderPicker';
import { SourcePatternField } from '@/features/crawl/components/SourcePatternField';
import { AddSourceToggles } from '@/features/crawl/components/AddSourceToggles';
import { fetchCrawlEmbeddingTargetOptions } from '@/features/crawl/services/crawl.service';
import type {
  AddSourcePayload,
  CrawlCadence,
  CrawlEmbeddingTargetOptions,
  CrawlProviderIngestTarget,
  CrawlSource,
  CrawlSourceType,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import {
  resolveEditProviderPreselection,
  resolveSourceEmbeddingMessages,
} from '@/features/crawl/utils/crawl-source-embedding-form';
import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { formatCrawlDepthLabel } from '@/features/crawl/utils/crawl.utils';
import { normalizeCrawlUrl } from '@/features/crawl/utils/crawl-api-mappers';
import { getCrawlSourceKind } from '@/features/crawl/utils/crawl-source-kind';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  visible: boolean;
  mode: 'add' | 'edit';
  /** Kind to create in add mode; edit mode uses the source's own type. */
  sourceType?: CrawlSourceType;
  source?: CrawlSource | null;
  coverageEntry?: ItemEmbeddingCoverageEntry | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: AddSourcePayload) => void;
};

const DEPTH_OPTIONS = (t: (key: string, params?: Record<string, string | number>) => string) =>
  [0, 1, 2, 3, 4, 5].map((depth) => ({
    key: String(depth),
    label: formatCrawlDepthLabel(depth, t),
  }));

const CADENCE_OPTIONS = (t: (key: string) => string): { key: CrawlCadence; label: string }[] => [
  { key: 'DAILY', label: t('crawl.filters.cadenceDaily') },
  { key: 'WEEKLY', label: t('crawl.filters.cadenceWeekly') },
  { key: 'ONCE', label: t('crawl.filters.cadenceOnce') },
];

const DEFAULT_FORM: AddSourcePayload = {
  name: '',
  base_url: '',
  depth: 2,
  cadence: 'DAILY',
  headless_mode: 'OFF',
  description: '',
  skip_header_footer: true,
  index_site_header: false,
  index_site_footer: false,
  rescope_root_links: false,
  allowlist: [],
  denylist: [],
};

export function AddSourceSheet({
  visible,
  mode,
  sourceType,
  source,
  coverageEntry,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const isCompact = useCrawlCompactLayout();
  const kindConfig = getCrawlSourceKind(mode === 'edit' ? source?.source_type : sourceType);
  const [form, setForm] = useState<AddSourcePayload>(DEFAULT_FORM);
  const [allowDraft, setAllowDraft] = useState('');
  const [denyDraft, setDenyDraft] = useState('');
  const [embeddingOptions, setEmbeddingOptions] = useState<CrawlEmbeddingTargetOptions | null>(null);
  const [embeddingOptionsError, setEmbeddingOptionsError] = useState(false);
  const [embeddingOptionsLoading, setEmbeddingOptionsLoading] = useState(false);
  /** Seed edit form only when the sheet opens or the edited source id changes (not every poll). */
  const editSeedKeyRef = useRef<string | null>(null);
  const ingestTargetTouchedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      editSeedKeyRef.current = null;
      ingestTargetTouchedRef.current = false;
      return;
    }
    let cancelled = false;
    setEmbeddingOptionsLoading(true);
    setEmbeddingOptionsError(false);
    void fetchCrawlEmbeddingTargetOptions()
      .then((options) => {
        if (cancelled) return;
        setEmbeddingOptions(options);
        if (!options) {
          setEmbeddingOptionsError(true);
          return;
        }
        if (mode === 'add' && !ingestTargetTouchedRef.current) {
          setForm((current) => ({
            ...current,
            ingest_embedding_target: options.default_provider ?? undefined,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setEmbeddingOptionsError(true);
      })
      .finally(() => {
        if (!cancelled) setEmbeddingOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, mode]);

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && source) {
      const seedKey = `${source.id}`;
      if (editSeedKeyRef.current === seedKey) return;
      editSeedKeyRef.current = seedKey;
      ingestTargetTouchedRef.current = false;
      setForm({
        name: source.name,
        base_url: source.base_url,
        depth: source.depth,
        cadence: source.cadence,
        headless_mode: source.headless_mode,
        description: source.description,
        skip_header_footer: source.skip_header_footer,
        index_site_header: source.index_site_header,
        index_site_footer: source.index_site_footer,
        rescope_root_links: source.rescope_root_links,
        allowlist: [...source.allowlist],
        denylist: [...source.denylist],
        ingest_embedding_target: undefined,
      });
    } else if (mode === 'add') {
      editSeedKeyRef.current = null;
      ingestTargetTouchedRef.current = false;
      setForm(DEFAULT_FORM);
    }
    setAllowDraft('');
    setDenyDraft('');
  }, [visible, mode, source?.id, sourceType]);

  useEffect(() => {
    if (!visible || mode !== 'edit' || !embeddingOptions || !source) return;
    if (ingestTargetTouchedRef.current) return;
    const nextTarget =
      resolveEditProviderPreselection(source, coverageEntry, embeddingOptions) ?? undefined;
    setForm((current) => {
      if (current.ingest_embedding_target === nextTarget) return current;
      return { ...current, ingest_embedding_target: nextTarget };
    });
  }, [coverageEntry, embeddingOptions, mode, source, visible]);
  const isAdd = mode === 'add';
  const canSubmit = Boolean(
    form.name.trim() &&
      form.base_url.trim() &&
      (!isAdd || form.ingest_embedding_target) &&
      !embeddingOptionsLoading &&
      !embeddingOptionsError,
  );

  const embeddingMessages = useMemo(
    () =>
      resolveSourceEmbeddingMessages({
        mode,
        source,
        selected: form.ingest_embedding_target,
        coverageEntry,
        options: embeddingOptions,
        t,
      }),
    [coverageEntry, embeddingOptions, form.ingest_embedding_target, mode, source, t],
  );

  const selectProvider = (provider: CrawlProviderIngestTarget) => {
    ingestTargetTouchedRef.current = true;
    setForm((current) => ({ ...current, ingest_embedding_target: provider }));
  };

  const submit = () => {
    // Edit keeps the stored target (incl. legacy search/chat/both) unless the user picked a provider.
    const keepStoredTarget = !isAdd && !ingestTargetTouchedRef.current;
    onSubmit({
      ...form,
      ...(isAdd ? { source_type: kindConfig.kind } : {}),
      base_url: normalizeCrawlUrl(form.base_url),
      depth: kindConfig.showDepth ? form.depth : 0,
      rescope_root_links: kindConfig.showRescopeRootLinks && form.rescope_root_links,
      ingest_embedding_target: keepStoredTarget ? undefined : form.ingest_embedding_target,
    });
  };

  const addPattern = (kind: 'allowlist' | 'denylist', draft: string, clear: () => void) => {
    const value = draft.trim();
    if (!value) return;
    setForm((current) => ({
      ...current,
      [kind]: current[kind].includes(value) ? current[kind] : [...current[kind], value],
    }));
    clear();
  };

  const removePattern = (kind: 'allowlist' | 'denylist', pattern: string) => {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item !== pattern),
    }));
  };

  return (
    <CrawlSheet
      visible={visible}
      size="sideSheetSource"
      title={isAdd ? t('crawl.form.addTitle') : t('crawl.form.editTitle')}
      subtitle={t('crawl.form.description')}
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={t('common.cancel')}
          primaryLabel={isAdd ? t('crawl.form.submit.create') : t('crawl.form.submit.update')}
          onCancel={onClose}
          onPrimary={submit}
          primaryLoading={saving}
          primaryDisabled={saving || !canSubmit}
          cancelDisabled={saving}
        />
      }>
      <FormRow stack={isCompact}>
        <View style={[styles.fieldHalf, isCompact ? styles.fieldFull : null]}>
          <AppTextField
            label={t('crawl.form.name.label')}
            value={form.name}
            onChangeText={(name) => setForm((current) => ({ ...current, name }))}
            placeholder={t('crawl.form.name.placeholder')}
          />
        </View>
        <View style={[styles.fieldHalf, isCompact ? styles.fieldFull : null]}>
          <AppTextField
            label={t(kindConfig.urlLabelKey)}
            value={form.base_url}
            onChangeText={(base_url) => setForm((current) => ({ ...current, base_url }))}
            autoCapitalize="none"
            placeholder={t(kindConfig.urlPlaceholderKey)}
          />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 }]}>
            {t(kindConfig.urlHelperKey)}
          </Text>
        </View>
      </FormRow>

      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('crawl.form.description.label')}</Text>
        <View
          style={[
            styles.textareaWrap,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surfaceMuted,
            },
          ]}>
          <TextInput
            accessibilityLabel={t('crawl.form.description.label')}
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            placeholder={t('crawl.form.description.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={[getInputTextStyle(typography.fieldInput, { multiline: true }), styles.textarea, { color: colors.text }]}
          />
        </View>
      </View>

      <FormRow stack={isCompact}>
        {kindConfig.showDepth ? (
          <View style={[styles.fieldHalf, isCompact ? styles.fieldFull : null]}>
            <AppSelectField
              label={t('crawl.form.depth.label')}
              value={String(form.depth)}
              pickerPresentation="inline"
              options={DEPTH_OPTIONS(t)}
              onChange={(depth) => setForm((current) => ({ ...current, depth: Number(depth) || 1 }))}
            />
          </View>
        ) : null}
        <View style={[styles.fieldHalf, isCompact ? styles.fieldFull : null]}>
          <AppSelectField
            label={t('crawl.form.frequency.label')}
            value={form.cadence}
            pickerPresentation="inline"
            options={CADENCE_OPTIONS(t)}
            onChange={(cadence) => setForm((current) => ({ ...current, cadence: cadence as CrawlCadence }))}
          />
        </View>
      </FormRow>

      <EmbeddingProviderPicker
        loading={embeddingOptionsLoading}
        failed={embeddingOptionsError}
        options={embeddingOptions}
        selected={form.ingest_embedding_target}
        messages={embeddingMessages}
        onSelect={selectProvider}
        onOpenModelConfiguration={onClose}
      />

      <AddSourceToggles
        form={form}
        showRescopeRootLinks={kindConfig.showRescopeRootLinks}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />

      <SourcePatternField
        label={t('crawl.form.allowPatterns.label')}
        description={t('crawl.form.allowPatterns.helper')}
        placeholder={t('crawl.form.allowPatterns.placeholder')}
        draft={allowDraft}
        patterns={form.allowlist}
        onChangeDraft={setAllowDraft}
        onAdd={() => addPattern('allowlist', allowDraft, () => setAllowDraft(''))}
        onRemove={(pattern) => removePattern('allowlist', pattern)}
      />

      <SourcePatternField
        label={t('crawl.form.denyPatterns.label')}
        description={t('crawl.form.denyPatterns.helper')}
        placeholder={t('crawl.form.denyPatterns.placeholder')}
        draft={denyDraft}
        patterns={form.denylist}
        onChangeDraft={setDenyDraft}
        onAdd={() => addPattern('denylist', denyDraft, () => setDenyDraft(''))}
        onRemove={(pattern) => removePattern('denylist', pattern)}
      />
    </CrawlSheet>
  );
}

function FormRow({ stack, children }: { stack?: boolean; children: React.ReactNode }) {
  const { spacing } = useAppTheme();
  if (stack) {
    return <View style={{ gap: spacing.md }}>{children}</View>;
  }
  return <View style={[styles.formRow, { gap: spacing.md }]}>{children}</View>;
}

const styles = StyleSheet.create({
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  fieldHalf: {
    flex: 1,
    minWidth: 260,
  },
  fieldFull: {
    flexBasis: '100%',
    minWidth: undefined,
  },
  textareaWrap: {
    borderWidth: 1,
    minHeight: 96,
  },
  textarea: {
    minHeight: 88,
  },
  // (preview URL UI removed)
});
