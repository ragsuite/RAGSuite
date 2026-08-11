import React from 'react';
import { useRouter } from 'expo-router';
import { Globe, Settings } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { formatAllowedDomainPreview } from '@/features/search-config/utils/domain-display';
import {
  settingsOverviewApiKeyFromModel,
  settingsOverviewButtonTypeLabel,
  settingsOverviewCitationLayoutLabel,
  settingsOverviewCitationNumberingLabel,
  settingsOverviewCitationStyleLabel,
  settingsOverviewFormTypeLabel,
  settingsOverviewIconLabel,
  settingsOverviewLanguageLabel,
  settingsOverviewProviderLabel,
  settingsOverviewStyleLabel,
} from '@/features/search-config/utils/settings-overview-display';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const PREVIEW_DOMAIN_LIMIT = 3;

export function SettingsOverviewPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const router = useRouter();
  const { isNativeMobile, showSettingsSidebar } = useSearchConfigLayout();
  const { bundle } = useSearchConfig();
  const modelSettings = bundle?.modelSettings;
  const citation = bundle?.citationFormat;
  const searchConfig = bundle?.searchBoxConfig;
  const customization = bundle?.searchBoxCustomization;
  const allowedDomains = bundle?.allowedDomains ?? [];

  const useThreeColumnGrid = showSettingsSidebar;

  const providerLabel = settingsOverviewProviderLabel(modelSettings?.provider);
  const chatModel = modelSettings?.chatModel ?? t('common.notSet');
  const embeddingModel = modelSettings?.embeddingModel ?? bundle?.activeConfig?.embeddingModel ?? t('common.notSet');
  const apiKeyPreview = settingsOverviewApiKeyFromModel(modelSettings);

  const citationStyle = settingsOverviewCitationStyleLabel(citation?.citationStyle);
  const citationLayout = settingsOverviewCitationLayoutLabel(citation?.layout);
  const citationNumbering = settingsOverviewCitationNumberingLabel(citation?.numberingStyle);

  const searchTitle = searchConfig?.title?.trim() || t('common.notSet');
  const searchLanguage = settingsOverviewLanguageLabel(searchConfig?.language);
  const searchStyle = settingsOverviewStyleLabel(searchConfig?.style);
  const searchIcon = settingsOverviewIconLabel(searchConfig?.searchIcon);

  const formType = settingsOverviewFormTypeLabel(customization?.searchFormType);
  const buttonType = settingsOverviewButtonTypeLabel(customization?.buttonType);
  const recentSearchEnabled = customization?.recentSearchEnabled ?? false;
  const questionsEnabled = bundle?.predefinedQuestions?.enabled ?? false;

  const domainPreview = allowedDomains.slice(0, PREVIEW_DOMAIN_LIMIT);
  const remainingDomains = Math.max(0, allowedDomains.length - domainPreview.length);

  return (
    <StatePanel isEmpty={!bundle} emptyLabel={t('search.settings.preview.unavailable')}>
      {bundle ? (
        <SearchConfigPanelCard
          icon={Settings}
          title={t('search.settings.preview.title')}
          subtitle={t('search.settings.preview.description')}>
          <View style={{ gap: spacing.sm }}>
            <View
              style={[
                styles.grid,
                { gap: spacing.sm },
                useThreeColumnGrid ? styles.gridDesktop : styles.gridStacked,
              ]}>
              <PreviewTile
                desktop={useThreeColumnGrid}
                colors={colors}
                spacing={spacing}
                onPress={
                  isNativeMobile
                    ? () => router.push('/(app)/search-config/model-settings')
                    : undefined
                }
                accessibilityLabel="Open model settings">
                <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                  {t('search.settings.preview.models')}
                </Text>
                <Text style={[typography.body, { color: colors.text, fontWeight: '500', marginTop: 2, fontSize: 14 }]}>
                  {providerLabel}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                  {t('search.settings.preview.chatModel', { model: chatModel })}
                </Text>
                {embeddingModel ? (
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {t('search.settings.preview.embeddingModel', { model: embeddingModel })}
                  </Text>
                ) : null}
                {apiKeyPreview ? (
                  <View style={[styles.apiKeyRow, { borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
                    <Text style={[typography.caption, { color: colors.textMuted, opacity: 0.75 }]}>
                      {t('search.settings.preview.apiKeyLabel')}{' '}
                    </Text>
                    <Text style={[typography.caption, styles.domainUrl, { color: colors.textMuted, fontFamily: fonts.mono }]}>
                      {apiKeyPreview}
                    </Text>
                  </View>
                ) : null}
              </PreviewTile>

              <PreviewTile desktop={useThreeColumnGrid} colors={colors} spacing={spacing}>
                <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                  {t('search.settings.preview.citations')}
                </Text>
                <PreviewRow
                  label={t('search.settings.preview.style')}
                  value={citationStyle} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.layout')}
                  value={citationLayout} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.numbering')}
                  value={citationNumbering}
                  colors={colors}
                  typography={typography}
                  boldValue
                />
              </PreviewTile>

              <PreviewTile desktop={useThreeColumnGrid} colors={colors} spacing={spacing}>
                <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                  {t('search.settings.preview.searchConfig')}
                </Text>
                <PreviewRow
                  label={t('search.settings.preview.titleLabel')}
                  value={searchTitle}
                  colors={colors}
                  typography={typography}
                  boldValue
                  numberOfLines={1}
                />
                <PreviewRow
                  label={t('search.settings.preview.languageLabel')}
                  value={searchLanguage} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.styleLabel')}
                  value={searchStyle} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.iconLabel')}
                  value={searchIcon} colors={colors} typography={typography} boldValue />
              </PreviewTile>

              <PreviewTile desktop={useThreeColumnGrid} colors={colors} spacing={spacing}>
                <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                  {t('search.settings.preview.customisation')}
                </Text>
                <PreviewRow
                  label={t('search.settings.preview.formType')}
                  value={formType} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.buttonType')}
                  value={buttonType} colors={colors} typography={typography} boldValue />
                <PreviewRow
                  label={t('search.settings.preview.recentSearch')}
                  value={
                    recentSearchEnabled
                      ? t('search.settings.preview.enabled')
                      : t('search.settings.preview.disabled')
                  }
                  colors={colors}
                  typography={typography}
                  status={recentSearchEnabled ? 'enabled' : 'disabled'}
                />
                <PreviewRow
                  label={t('search.settings.preview.questions')}
                  value={
                    questionsEnabled
                      ? t('search.settings.preview.enabled')
                      : t('search.settings.preview.disabled')
                  }
                  colors={colors}
                  typography={typography}
                  status={questionsEnabled ? 'enabled' : 'disabled'}
                />
              </PreviewTile>

              <PreviewTile desktop={useThreeColumnGrid} colors={colors} spacing={spacing}>
                <View style={styles.titleWithIcon}>
                  <Globe size={12} color={colors.textMuted} />
                  <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                    {t('search.settings.preview.allowedDomains')}
                  </Text>
                </View>
                <PreviewRow
                  label={t('search.settings.preview.allowlist')}
                  value={t('search.settings.preview.configuredCount', { count: allowedDomains.length })}
                  colors={colors}
                  typography={typography}
                  status={allowedDomains.length > 0 ? 'enabled' : 'disabled'}
                  badgeOnly
                />
                {allowedDomains.length > 0 ? (
                  <View style={[styles.domainList, { borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
                    <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>
                      {t('search.settings.preview.allowedUrls')}
                    </Text>
                    <View style={{ gap: 3 }}>
                      {domainPreview.map((domain) => (
                        <Text
                          key={domain.id}
                          style={[typography.caption, styles.domainUrl, { color: colors.text, fontFamily: fonts.mono }]}
                          numberOfLines={1}>
                          {formatAllowedDomainPreview(domain.domain, domain.scope)}
                        </Text>
                      ))}
                      {remainingDomains > 0 ? (
                        <Text style={[typography.caption, { color: colors.textMuted }]}>
                          {t('search.settings.preview.moreCount', { count: remainingDomains })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </PreviewTile>
            </View>
          </View>
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

function PreviewTile({
  children,
  desktop,
  colors,
  spacing,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  desktop?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { surfaceRadius } = useAppTheme();
  const tileStyle = [
    styles.tile,
    desktop ? styles.tileDesktop : null,
    {
      borderColor: colors.border,
      borderRadius: surfaceRadius.card,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.md,
      gap: 4,
    },
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [tileStyle, { opacity: pressed ? 0.88 : 1 }]}>
        {children}
      </Pressable>
    );
  }

  return <View style={tileStyle}>{children}</View>;
}

function PreviewRow({
  label,
  value,
  boldValue,
  status,
  badgeOnly,
  numberOfLines,
  colors,
  typography,
}: {
  label: string;
  value: string;
  boldValue?: boolean;
  status?: 'enabled' | 'disabled';
  badgeOnly?: boolean;
  numberOfLines?: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  typography: ReturnType<typeof useAppTheme>['typography'];
}) {
  return (
    <View style={styles.rowBetween}>
      {!badgeOnly ? (
        <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12 }]}>{label}</Text>
      ) : (
        <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12, fontWeight: '500' }]}>{label}</Text>
      )}
      {status ? (
        <StatusBadge
          label={value}
          tone={status === 'enabled' ? 'active' : 'inactive'}
          size="compact"
          preserveCase
        />
      ) : (
        <Text
          style={[
            typography.caption,
            {
              color: colors.text,
              fontWeight: boldValue ? '600' : '500',
              fontSize: 12,
              flexShrink: 1,
              textAlign: 'right',
            },
          ]}
          numberOfLines={numberOfLines}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignItems: 'stretch',
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridStacked: {
    flexDirection: 'column',
  },
  tile: {
    borderWidth: 1,
    minHeight: 108,
    width: '100%',
  },
  tileDesktop: {
    width: '32%',
    flexGrow: 1,
    minWidth: 200,
  },
  tileHeading: {
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  domainList: {
    borderTopWidth: 1,
  },
  domainUrl: {
    fontSize: 11,
    lineHeight: 16,
  },
});
