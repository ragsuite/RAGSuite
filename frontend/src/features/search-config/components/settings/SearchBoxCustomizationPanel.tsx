import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Palette } from 'lucide-react-native';

import { SearchBoxPreview } from '@/features/search-config/components/SearchBoxPreview';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigPreviewLayout } from '@/features/search-config/components/SearchConfigPreviewLayout';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SearchBoxCustomization } from '@/features/search-config/types/search-config.types';
import {
  SEARCH_BOX_BUTTON_TYPE_OPTIONS,
  SEARCH_BOX_FORM_TYPE_OPTIONS,
} from '@/features/search-config/utils/search-box-customization-options';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

function FieldHint({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'danger' }) {
  const { colors, typography, surfaceRadius } = useAppTheme();
  const color = tone === 'danger' ? colors.danger : colors.textMuted;
  return <Text style={[typography.caption, { color, lineHeight: 18, marginTop: 2 }]}>{children}</Text>;
}

export function SearchBoxCustomizationPanel() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { bundle, saving, handleSaveSearchBoxCustomization } = useSearchConfig();
  const [draft, setDraft] = useState<SearchBoxCustomization | null>(null);

  useEffect(() => {
    if (bundle?.searchBoxCustomization) setDraft(bundle.searchBoxCustomization);
  }, [bundle?.searchBoxCustomization]);

  const dirty =
    draft && bundle ? JSON.stringify(draft) !== JSON.stringify(bundle.searchBoxCustomization) : false;
  const config = bundle?.searchBoxConfig;
  const withButton = draft?.searchFormType === 'with-button';
  const showButtonText = withButton && draft?.buttonType === 'with-label';

  const customisationForm = draft ? (
    <View style={{ gap: spacing.md }}>
      <AppSelectField
        label={t('search.customisation.formType.label')}
        value={draft.searchFormType}
        options={SEARCH_BOX_FORM_TYPE_OPTIONS}
        onChange={(searchFormType) => setDraft((prev) => (prev ? { ...prev, searchFormType } : prev))}
        pickerTitle={t('search.customisation.formType.label')}
      />

      <View>
        <AppSelectField
          label={t('search.customisation.buttonType.label')}
          value={draft.buttonType}
          options={SEARCH_BOX_BUTTON_TYPE_OPTIONS}
          onChange={(buttonType) => setDraft((prev) => (prev ? { ...prev, buttonType } : prev))}
          pickerTitle={t('search.customisation.buttonType.label')}
        />
        {!withButton ? (
          <FieldHint tone="danger">{t('search.customisation.buttonType.error')}</FieldHint>
        ) : null}
      </View>

      {showButtonText ? (
        <AppTextField
          label={t('search.customisation.buttonText.label')}
          value={draft.searchButtonText}
          onChangeText={(searchButtonText) =>
            setDraft((prev) => (prev ? { ...prev, searchButtonText } : prev))
          }
        />
      ) : null}

      <AppTextField
        label={t('search.customisation.inputPlaceholder.label')}
        value={draft.searchInputPlaceholder}
        onChangeText={(searchInputPlaceholder) =>
          setDraft((prev) => (prev ? { ...prev, searchInputPlaceholder } : prev))
        }
      />

      <AppSwitchRow
        bordered={false}
        label={t('search.customisation.recentSearch.label')}
        description={t('search.customisation.recentSearch.helper')}
        value={draft.recentSearchEnabled}
        onChange={(recentSearchEnabled) =>
          setDraft((prev) => (prev ? { ...prev, recentSearchEnabled } : prev))
        }
      />

      {draft.recentSearchEnabled ? (
        <AppTextField
          label={t('search.customisation.recentSearch.titleLabel')}
          value={draft.recentSearchTitle}
          onChangeText={(recentSearchTitle) =>
            setDraft((prev) => (prev ? { ...prev, recentSearchTitle } : prev))
          }
        />
      ) : null}

      <AppButton
        variant="cta"
        size="compact"
        label={t('search.customisation.save')}
        icon={ActionIcons.save}
        loading={saving}
        disabled={!dirty || saving}
        onPress={() => void handleSaveSearchBoxCustomization(draft)}
      />
    </View>
  ) : null;

  return (
    <StatePanel isEmpty={!draft || !config} emptyLabel={t('search.customisation.unavailable')}>
      {draft && config ? (
        <SearchConfigPreviewLayout
          preview={
            <SearchBoxPreview
              config={config}
              customization={draft}
              previewContext="customisation"
            />
          }
          form={
            <SearchConfigPanelCard
              icon={Palette}
              title={t('search.customisation.title')}
              subtitle={t('search.customisation.description')}>
              {customisationForm}
            </SearchConfigPanelCard>
          }
        />
      ) : null}
    </StatePanel>
  );
}

