import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { SearchBoxPreview } from '@/features/search-config/components/SearchBoxPreview';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigPreviewLayout } from '@/features/search-config/components/SearchConfigPreviewLayout';
import {
  BackgroundColorField,
  SearchIconSelectField,
  searchIconAppliesToButton,
  searchIconWorksInField,
} from '@/features/search-config/components/settings/search-box-config-fields';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SearchBoxConfig } from '@/features/search-config/types/search-config.types';
import {
  SEARCH_BOX_BORDER_RADIUS_OPTIONS,
  SEARCH_BOX_LANGUAGE_OPTIONS,
  SEARCH_BOX_LOADER_OPTIONS,
  SEARCH_BOX_STYLE_OPTIONS,
} from '@/features/search-config/utils/search-box-config-options';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

function FieldHint({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'danger' }) {
  const { colors, typography } = useAppTheme();
  const color = tone === 'danger' ? colors.danger : colors.textMuted;
  return <Text style={[typography.caption, { color, lineHeight: 18, marginTop: 2 }]}>{children}</Text>;
}

export function SearchBoxConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { bundle, saving, handleSaveSearchBoxConfig } = useSearchConfig();
  const historyOff = bundle?.privacySettings?.storeHistoryEnabled === false;
  const [draft, setDraft] = useState<SearchBoxConfig | null>(null);
  const [showLoaderPreview, setShowLoaderPreview] = useState(false);
  const prevLoaderRef = useRef<SearchBoxConfig['loader'] | null>(null);

  useEffect(() => {
    if (bundle?.searchBoxConfig) setDraft(bundle.searchBoxConfig);
  }, [bundle?.searchBoxConfig]);

  useEffect(() => {
    if (!draft) return;
    const prev = prevLoaderRef.current;
    if (prev !== null && prev !== draft.loader) {
      setShowLoaderPreview(true);
      const timer = setTimeout(() => setShowLoaderPreview(false), 2500);
      prevLoaderRef.current = draft.loader;
      return () => clearTimeout(timer);
    }
    prevLoaderRef.current = draft.loader;
  }, [draft?.loader, draft]);

  const dirty = draft && bundle ? JSON.stringify(draft) !== JSON.stringify(bundle.searchBoxConfig) : false;
  const customization = bundle?.searchBoxCustomization;
  const iconWorksInField = draft ? searchIconWorksInField(draft, customization) : true;
  const iconWorksOnButton = searchIconAppliesToButton(customization);

  const saveConfig = () => {
    if (!draft) return;
    void handleSaveSearchBoxConfig(draft);
  };

  const configurationForm = draft ? (
    <View style={{ gap: spacing.md }}>
      <AppTextField
        label={t('search.config.titleLabel')}
        placeholder={t('search.config.titlePlaceholder')}
        value={draft.title}
        onChangeText={(title) => setDraft((prev) => (prev ? { ...prev, title } : prev))}
      />

      <AppSelectField
        label={t('search.config.languageLabel')}
        value={draft.language}
        options={SEARCH_BOX_LANGUAGE_OPTIONS}
        onChange={(language) => setDraft((prev) => (prev ? { ...prev, language } : prev))}
      />

      <View>
        <AppSelectField
          label={t('search.config.styleLabel')}
          value={draft.style}
          options={SEARCH_BOX_STYLE_OPTIONS}
          onChange={(style) => setDraft((prev) => (prev ? { ...prev, style } : prev))}
        />
        <FieldHint>{t('search.config.styleHelper')}</FieldHint>
      </View>

      <View>
        <SearchIconSelectField
          value={draft.searchIcon}
          onChange={(searchIcon) => setDraft((prev) => (prev ? { ...prev, searchIcon } : prev))}
        />
        {!iconWorksInField && !iconWorksOnButton ? (
          <FieldHint tone="danger">
            Search Icon applies to the input when Search Form Type is &apos;Default&apos;, or to the search button when
            using an icon button (Customisation tab).
          </FieldHint>
        ) : null}
      </View>

      <AppSelectField
        label={t('search.config.loaderLabel')}
        value={draft.loader}
        options={SEARCH_BOX_LOADER_OPTIONS}
        onChange={(loader) => setDraft((prev) => (prev ? { ...prev, loader } : prev))}
      />

      <BackgroundColorField
        value={draft.backgroundColor}
        onChange={(backgroundColor) => setDraft((prev) => (prev ? { ...prev, backgroundColor } : prev))}
      />

      <AppSelectField
        label={t('search.config.borderRadiusLabel')}
        value={draft.borderRadius}
        options={SEARCH_BOX_BORDER_RADIUS_OPTIONS}
        onChange={(borderRadius) => setDraft((prev) => (prev ? { ...prev, borderRadius } : prev))}
      />

      <View
        style={[
          styles.feedbackRow,
          {
            borderColor: colors.border,
            borderRadius: panelRadius,
            padding: spacing.md,
          },
        ]}>
        <AppSwitchRow
          bordered={false}
          label={t('search.config.feedbackEnabled.label')}
          description={
            historyOff
              ? t('search.config.feedbackEnabled.requiresHistory')
              : t('search.config.feedbackEnabled.description')
          }
          value={draft.collectUserFeedback}
          disabled={historyOff}
          onChange={(collectUserFeedback) => setDraft((prev) => (prev ? { ...prev, collectUserFeedback } : prev))}
        />
      </View>

      <AppButton
        variant="cta"
        size="compact"
        label={t('search.config.save')}
        icon={ActionIcons.save}
        loading={saving}
        disabled={!dirty || saving}
        onPress={saveConfig}
      />
    </View>
  ) : null;

  return (
    <StatePanel isEmpty={!draft} emptyLabel={t('search.config.unavailable')}>
      {draft ? (
        <SearchConfigPreviewLayout
          preview={
            <SearchBoxPreview
              config={draft}
              customization={customization}
              predefinedQuestions={bundle?.predefinedQuestions ?? null}
              previewContext="configuration"
              showLoaderPreview={showLoaderPreview}
            />
          }
          form={
            <SearchConfigPanelCard
              icon={Search}
              title={t('search.config.title')}
              subtitle={t('search.config.description')}>
              {configurationForm}
            </SearchConfigPanelCard>
          }
        />
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  feedbackRow: {
    borderWidth: 1,
  },
});
