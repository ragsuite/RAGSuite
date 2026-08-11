import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import type { AddSourcePayload, CrawlCadence, CrawlSource } from '@/features/crawl/types/crawl.types';
import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { formatCrawlDepthLabel } from '@/features/crawl/utils/crawl.utils';
import { normalizeCrawlUrl } from '@/features/crawl/utils/crawl-api-mappers';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle, INPUT_FIELD_HEIGHT } from '@/shared/utils/input-text-style';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  visible: boolean;
  mode: 'add' | 'edit';
  source?: CrawlSource | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: AddSourcePayload) => void;
};

const DEPTH_OPTIONS = [0, 1, 2, 3, 4, 5].map((depth) => ({
  key: String(depth),
  label: formatCrawlDepthLabel(depth),
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
  rescope_root_links: false,
  allowlist: [],
  denylist: [],
};

export function AddSourceSheet({ visible, mode, source, saving, onClose, onSubmit }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const isCompact = useCrawlCompactLayout();
  const [form, setForm] = useState<AddSourcePayload>(DEFAULT_FORM);
  const [allowDraft, setAllowDraft] = useState('');
  const [denyDraft, setDenyDraft] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && source) {
      setForm({
        name: source.name,
        base_url: source.base_url,
        depth: source.depth,
        cadence: source.cadence,
        headless_mode: source.headless_mode,
        description: source.description,
        skip_header_footer: source.skip_header_footer,
        rescope_root_links: source.rescope_root_links,
        allowlist: [...source.allowlist],
        denylist: [...source.denylist],
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setAllowDraft('');
    setDenyDraft('');
  }, [visible, mode, source]);
  const canSubmit = Boolean(form.name.trim() && form.base_url.trim());
  const isAdd = mode === 'add';

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
          onPrimary={() => onSubmit({ ...form, base_url: normalizeCrawlUrl(form.base_url) })}
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
            label={t('crawl.form.url.label')}
            value={form.base_url}
            onChangeText={(base_url) => setForm((current) => ({ ...current, base_url }))}
            autoCapitalize="none"
            placeholder={t('crawl.form.url.placeholder')}
          />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 }]}>
            {t('crawl.form.url.helper')}
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
        <View style={[styles.fieldHalf, isCompact ? styles.fieldFull : null]}>
          <AppSelectField
            label={t('crawl.form.depth.label')}
            value={String(form.depth)}
            pickerPresentation="inline"
            options={DEPTH_OPTIONS}
            onChange={(depth) => setForm((current) => ({ ...current, depth: Number(depth) || 1 }))}
          />
        </View>
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

      <View style={{ gap: spacing.sm }}>
        <SourceToggleRow
          label={t('crawl.form.headless.label')}
          description={t('crawl.form.headless.helper')}
          value={form.headless_mode === 'ON'}
          onChange={(enabled) =>
            setForm((current) => ({ ...current, headless_mode: enabled ? 'ON' : 'OFF' }))
          }
        />

        <SourceToggleRow
          label={t('crawl.form.skipHeaderFooter.label')}
          description={t('crawl.form.skipHeaderFooter.helper')}
          value={form.skip_header_footer}
          onChange={(skip_header_footer) => setForm((current) => ({ ...current, skip_header_footer }))}
        />

        <SourceToggleRow
          label={t('crawl.form.rescopeRootLinks.label')}
          description={t('crawl.form.rescopeRootLinks.helper')}
          value={form.rescope_root_links}
          onChange={(rescope_root_links) => setForm((current) => ({ ...current, rescope_root_links }))}
        />
      </View>

      <PatternField
        label={t('crawl.form.allowPatterns.label')}
        description={t('crawl.form.allowPatterns.helper')}
        placeholder={t('crawl.form.allowPatterns.placeholder')}
        draft={allowDraft}
        patterns={form.allowlist}
        onChangeDraft={setAllowDraft}
        onAdd={() => addPattern('allowlist', allowDraft, () => setAllowDraft(''))}
        onRemove={(pattern) => removePattern('allowlist', pattern)}
      />

      <PatternField
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

function SourceToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.toggleRow, { gap: spacing.sm, minHeight: TOUCH_TARGET_MIN }]}>
      <View style={[styles.toggleCopy, { gap: spacing.xxs }]}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
        {description ? (
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.toggleControl}>
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500', textAlign: 'right' }]}>
          {value ? t('common.on') : t('common.off')}
        </Text>
        <Switch
          accessibilityLabel={label}
          accessibilityRole="switch"
          accessibilityState={{ checked: value }}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={Platform.OS === 'android' ? (value ? colors.textOnPrimary : colors.surface) : colors.surface}
          ios_backgroundColor={colors.surfaceMuted}
        />
      </View>
    </View>
  );
}

type PatternFieldProps = {
  label: string;
  description: string;
  placeholder: string;
  draft: string;
  patterns: string[];
  onChangeDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (pattern: string) => void;
};

function PatternField({
  label,
  description,
  placeholder,
  draft,
  patterns,
  onChangeDraft,
  onAdd,
  onRemove,
}: PatternFieldProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{description}</Text>
      <View
        style={[
          styles.patternCombo,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surfaceMuted,
          },
        ]}>
        <TextInput
          accessibilityLabel={label}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          onSubmitEditing={onAdd}
          returnKeyType="done"
          style={[
            getInputTextStyle(typography.fieldInput, { fillContainer: true }),
            styles.patternInput,
            { color: colors.text },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${label.toLowerCase()}`}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.patternAddBtn,
            {
              width: INPUT_FIELD_HEIGHT,
              borderLeftColor: colors.border,
              backgroundColor: pressed ? colors.primaryPressed : colors.primary,
            },
          ]}>
          <ActionIcons.add size={18} color={colors.textOnPrimary} />
        </Pressable>
      </View>
      {patterns.length > 0 ? (
        <View style={[styles.patternChips, { gap: spacing.xs }]}>
          {patterns.map((pattern) => (
            <Pressable
              key={pattern}
              accessibilityRole="button"
              accessibilityLabel={`Remove pattern ${pattern}`}
              onPress={() => onRemove(pattern)}
              style={({ pressed }) => [
                styles.patternChip,
                {
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.button,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.text }]} numberOfLines={1}>
                {pattern}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 56,
    justifyContent: 'flex-end',
  },
  textareaWrap: {
    borderWidth: 1,
    minHeight: 96,
  },
  textarea: {
    minHeight: 88,
  },
  patternCombo: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    overflow: 'hidden',
    height: INPUT_FIELD_HEIGHT,
  },
  patternInput: {
    flex: 1,
    minWidth: 0,
  },
  patternAddBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  patternChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  patternChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  // (preview URL UI removed)
});
