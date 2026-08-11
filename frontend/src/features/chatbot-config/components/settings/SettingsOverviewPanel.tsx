import React from 'react';
import { useRouter } from 'expo-router';
import { Globe, Settings } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import {
  settingsOverviewApiKeyPreview,
  settingsOverviewLanguageCode,
  settingsOverviewProviderLabel,
  settingsOverviewWidgetPositionLabel,
} from '@/features/chatbot-config/utils/settings-overview-display';
import { formatAllowedDomainPreview } from '@/features/search-config/utils/domain-display';
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
  const { isNativeMobile, showSettingsSidebar } = useChatbotConfigLayout();
  const { bundle } = useChatbotConfig();
  const overview = bundle?.settingsOverview;
  const allowedDomains = bundle?.allowedDomains ?? [];

  const useDesktopGrid = showSettingsSidebar;

  const providerLabel = settingsOverviewProviderLabel(overview?.provider ?? '');
  const chatModel = overview?.chatModel?.trim() || t('common.notSet');
  const embeddingModel = overview?.embeddingModel?.trim() || '';
  const apiKeyPreview = settingsOverviewApiKeyPreview(overview?.apiKeyMasked ?? '');

  const chatbotTitle = overview?.chatbotTitle?.trim() || t('common.notSet');
  const chatbotLanguage = settingsOverviewLanguageCode(overview?.language ?? '');

  const widgetPosition = settingsOverviewWidgetPositionLabel(overview?.widgetPosition ?? '');
  const avatarSize = overview?.avatarSize ?? 0;
  const showLogo = overview?.showLogo ?? false;
  const showDateTime = overview?.showDateTime ?? false;

  const domainPreview = allowedDomains.slice(0, PREVIEW_DOMAIN_LIMIT);
  const remainingDomains = Math.max(0, allowedDomains.length - domainPreview.length);

  return (
    <StatePanel isEmpty={!overview} emptyLabel={t('chatbot.settings.preview.unavailable')}>
      {overview ? (
        <SearchConfigPanelCard
          icon={Settings}
          title={t('chatbot.settings.preview.title')}
          subtitle={t('chatbot.settings.preview.description')}>
          <View
            style={[
              styles.grid,
              { gap: spacing.sm },
              useDesktopGrid ? styles.gridDesktop : styles.gridStacked,
            ]}>
            <PreviewTile
              desktop={useDesktopGrid}
              colors={colors}
              spacing={spacing}
              onPress={
                isNativeMobile ? () => router.push('/(app)/chatbot-config/model-settings') : undefined
              }
              accessibilityLabel="Open model settings">
              <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                {t('chatbot.settings.preview.models')}
              </Text>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500', marginTop: 2, fontSize: 14 }]}>
                {providerLabel}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                {t('chatbot.settings.preview.chatModel', { model: chatModel })}
              </Text>
              {embeddingModel ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {t('chatbot.settings.preview.embeddingModel', { model: embeddingModel })}
                </Text>
              ) : null}
              {apiKeyPreview ? (
                <View style={[styles.apiKeyRow, { borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
                  <Text style={[typography.caption, { color: colors.textMuted, opacity: 0.75 }]}>
                    {t('chatbot.settings.preview.apiKeyLabel')}{' '}
                  </Text>
                  <Text style={[typography.caption, styles.monoText, { color: colors.textMuted, fontFamily: fonts.mono }]}>{apiKeyPreview}</Text>
                </View>
              ) : null}
            </PreviewTile>

            <PreviewTile desktop={useDesktopGrid} colors={colors} spacing={spacing}>
              <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                {t('chatbot.settings.preview.chatbotConfig')}
              </Text>
              <PreviewRow
                label={t('chatbot.settings.preview.titleLabel')}
                value={chatbotTitle} colors={colors} typography={typography} boldValue numberOfLines={1} />
              <PreviewRow
                label={t('chatbot.settings.preview.languageLabel')}
                value={chatbotLanguage}
                colors={colors}
                typography={typography}
                boldValue
              />
            </PreviewTile>

            <PreviewTile desktop={useDesktopGrid} colors={colors} spacing={spacing}>
              <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                {t('chatbot.settings.preview.widget')}
              </Text>
              <PreviewRow
                label={t('chatbot.settings.preview.positionLabel')}
                value={widgetPosition} colors={colors} typography={typography} boldValue />
              <PreviewRow
                label={t('chatbot.settings.preview.avatarSizeLabel')}
                value={`${avatarSize}px`} colors={colors} typography={typography} boldValue />
              <PreviewRow
                label={t('chatbot.settings.preview.showLogoLabel')}
                value={showLogo ? t('common.yes') : t('common.no')}
                colors={colors}
                typography={typography}
                status={showLogo ? 'enabled' : 'disabled'}
              />
              <PreviewRow
                label={t('chatbot.settings.preview.showDateTimeLabel')}
                value={showDateTime ? t('common.yes') : t('common.no')}
                colors={colors}
                typography={typography}
                status={showDateTime ? 'enabled' : 'disabled'}
              />
            </PreviewTile>

            <PreviewTile desktop={useDesktopGrid} colors={colors} spacing={spacing}>
              <View style={styles.titleWithIcon}>
                <Globe size={12} color={colors.textMuted} />
                <Text style={[typography.caption, styles.tileHeading, { color: colors.textMuted }]}>
                  {t('chatbot.settings.preview.allowedDomains')}
                </Text>
              </View>
              <PreviewRow
                label={t('chatbot.settings.preview.allowlistLabel')}
                value={t('chatbot.settings.preview.configuredCount', { count: allowedDomains.length })}
                colors={colors}
                typography={typography}
                status={allowedDomains.length > 0 ? 'enabled' : 'disabled'}
                badgeOnly
              />
              {allowedDomains.length > 0 ? (
                <View style={[styles.domainList, { borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
                  <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 4 }]}>
                    {t('chatbot.settings.preview.allowedUrls')}
                  </Text>
                  <View style={{ gap: 3 }}>
                    {domainPreview.map((domain) => (
                      <Text
                        key={domain.id}
                        style={[typography.caption, styles.monoText, { color: colors.text, fontFamily: fonts.mono }]}
                        numberOfLines={1}>
                        {formatAllowedDomainPreview(domain.domain, domain.scope)}
                      </Text>
                    ))}
                    {remainingDomains > 0 ? (
                      <Text style={[typography.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>
                        {t('chatbot.settings.preview.moreCount', { count: remainingDomains })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={[styles.domainList, { borderTopColor: colors.border, marginTop: 6, paddingTop: 6 }]}>
                  <Text style={[typography.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>
                    {t('chatbot.settings.preview.noDomains')}
                  </Text>
                </View>
              )}
            </PreviewTile>
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
  monoText: {
    fontSize: 11,
    lineHeight: 16,
  },
});
