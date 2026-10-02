import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Palette } from 'lucide-react-native';

import { SearchBoxPreview } from '@/features/search-config/components/SearchBoxPreview';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigPreviewLayout } from '@/features/search-config/components/SearchConfigPreviewLayout';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SearchBoxCustomization } from '@/features/search-config/types/search-config.types';
import {
  applyEffectiveSearchDisclaimerToCustomization,
  canCustomizeSearchBrand,
  DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL,
} from '@/features/search-config/utils/search-brand-gate';
import {
  clampRecentSearchLimit,
  RECENT_SEARCH_LIMIT_MAX,
  RECENT_SEARCH_LIMIT_MIN,
} from '@/features/search-config/utils/recent-search-limit';
import {
  SEARCH_BOX_BUTTON_TYPE_OPTIONS,
  SEARCH_BOX_FORM_TYPE_OPTIONS,
} from '@/features/search-config/utils/search-box-customization-options';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedAdornment, EnterpriseLockedHint } from '@/platform/ee-locked';
import { AppButton } from '@/shared/components/app-button';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';
import { PRODUCT_WEBSITE_URL } from '@/shared/constants/product-links';

function FieldHint({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'danger' }) {
  const { colors, typography } = useAppTheme();
  const color = tone === 'danger' ? colors.danger : colors.textMuted;
  return <Text style={[typography.caption, { color, lineHeight: 18, marginTop: 2 }]}>{children}</Text>;
}

export function SearchBoxCustomizationPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const brandEditable = canCustomizeSearchBrand(enterpriseModulesAvailable);
  const { bundle, saving, handleSaveSearchBoxCustomization } = useSearchConfig();
  const [draft, setDraft] = useState<SearchBoxCustomization | null>(null);

  useEffect(() => {
    if (bundle?.searchBoxCustomization) {
      setDraft(
        applyEffectiveSearchDisclaimerToCustomization(
          bundle.searchBoxCustomization,
          brandEditable,
        ),
      );
    }
  }, [bundle?.searchBoxCustomization, brandEditable]);

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
        <>
          <AppTextField
            label={t('search.customisation.recentSearch.titleLabel')}
            value={draft.recentSearchTitle}
            onChangeText={(recentSearchTitle) =>
              setDraft((prev) => (prev ? { ...prev, recentSearchTitle } : prev))
            }
          />
          <View>
            <AppRangeField
              label={t('search.customisation.recentSearch.limitLabel')}
              value={clampRecentSearchLimit(draft.recentSearchLimit)}
              min={RECENT_SEARCH_LIMIT_MIN}
              max={RECENT_SEARCH_LIMIT_MAX}
              step={1}
              onChange={(value) =>
                setDraft((prev) =>
                  prev ? { ...prev, recentSearchLimit: clampRecentSearchLimit(value) } : prev,
                )
              }
            />
            <FieldHint>
              {t('search.customisation.recentSearch.limitHelper', { max: RECENT_SEARCH_LIMIT_MAX })}
            </FieldHint>
          </View>
        </>
      ) : null}

      <AppSwitchRow
        bordered={false}
        label={t('search.customisation.showSpeech.label')}
        description={t('search.customisation.showSpeech.helper')}
        value={Boolean(draft.showSpeechInput && draft.showSpeechOutput)}
        onChange={(showSpeech) =>
          setDraft((prev) =>
            prev ? { ...prev, showSpeechInput: showSpeech, showSpeechOutput: showSpeech } : prev,
          )
        }
      />

      <SectionCard
        title={t('search.widget.disclaimer.title')}
        subtitle={t('search.widget.disclaimer.subtitle')}
        titleRight={brandEditable ? undefined : <EnterpriseLockedAdornment />}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.sm, opacity: brandEditable ? 1 : 0.55 }}>
            <AppSwitchRow
              label={t('search.widget.disclaimer.show')}
              bordered={false}
              value={draft.showDisclaimer !== false}
              disabled={!brandEditable}
              onChange={(showDisclaimer) =>
                setDraft((prev) => (prev ? { ...prev, showDisclaimer } : prev))
              }
            />
            {draft.showDisclaimer !== false ? (
              <AppTextField
                label={t('search.widget.disclaimer.text')}
                value={draft.disclaimerText || ''}
                editable={brandEditable}
                placeholder={t('chatbot.widget.app.disclaimer')}
                onChangeText={(disclaimerText) =>
                  setDraft((prev) => (prev ? { ...prev, disclaimerText } : prev))
                }
              />
            ) : null}
            <AppSwitchRow
              label={t('search.widget.disclaimer.showLink')}
              description={t('search.widget.disclaimer.showLink.helper')}
              bordered={false}
              value={draft.showDisclaimerLink !== false}
              disabled={!brandEditable || draft.showDisclaimer === false}
              onChange={(showDisclaimerLink) =>
                setDraft((prev) => (prev ? { ...prev, showDisclaimerLink } : prev))
              }
            />
            {draft.showDisclaimer !== false && draft.showDisclaimerLink !== false ? (
              <View style={{ gap: spacing.sm }}>
                <AppTextField
                  label={t('search.widget.disclaimer.linkLabel')}
                  value={draft.disclaimerLinkLabel || ''}
                  editable={brandEditable}
                  placeholder={DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL}
                  onChangeText={(disclaimerLinkLabel) =>
                    setDraft((prev) => (prev ? { ...prev, disclaimerLinkLabel } : prev))
                  }
                />
                <AppTextField
                  label={t('search.widget.disclaimer.linkUrl')}
                  value={draft.disclaimerLinkUrl || ''}
                  editable={brandEditable}
                  placeholder={PRODUCT_WEBSITE_URL}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(disclaimerLinkUrl) =>
                    setDraft((prev) => (prev ? { ...prev, disclaimerLinkUrl } : prev))
                  }
                />
              </View>
            ) : null}
          </View>
          {!brandEditable ? (
            <EnterpriseLockedHint>
              {t('search.widget.disclaimer.enterpriseLocked', {
                defaultValue:
                  'Enterprise white-label unlocks custom disclaimer text and brand link.',
              })}
            </EnterpriseLockedHint>
          ) : null}
        </View>
      </SectionCard>

      <AppButton
        variant="cta"
        size="compact"
        label={t('search.customisation.save')}
        icon={ActionIcons.save}
        loading={saving}
        disabled={!dirty || saving}
        onPress={() =>
          void handleSaveSearchBoxCustomization(
            applyEffectiveSearchDisclaimerToCustomization(draft, brandEditable),
          )
        }
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
