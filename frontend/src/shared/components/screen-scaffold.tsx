import { LinearGradient } from 'expo-linear-gradient';
import { ChartColumn, ShieldCheck, Sparkles, Zap } from 'lucide-react-native';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { brandTokens } from '@/theme/brand-tokens';
import { useTranslation } from '@/i18n';
import { AppIllustration } from '@/shared/components/app-illustration';
import { AppIcon } from '@/shared/components/app-icon';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { AppSafeArea } from '@/shared/components/app-safe-area';
import { AppStatusBar } from '@/shared/components/app-status-bar';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableViewportWidth } from '@/shared/hooks/use-stable-viewport-width';

type Props = {
  title: string;
  subtitle: string;
  illustrationUri?: string;
  webLayout?: 'marketing-left' | 'marketing-right';
  showFooter?: boolean;
  /** Richer native auth layout: gradient hero + feature highlights. */
  authLayout?: boolean;
  children: React.ReactNode;
};

export function ScreenScaffold({
  title,
  subtitle,
  illustrationUri,
  webLayout = 'marketing-left',
  showFooter = false,
  authLayout = false,
  children,
}: Props) {
  const { colors, spacing, typography, elevation, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const width = useStableViewportWidth();
  const orgName = BRANDING_DEFAULTS.orgName;
  const logoDataUrl = BRANDING_DEFAULTS.logoDataUrl;
  const brandingColor = BRANDING_DEFAULTS.primaryColor;
  const heroGradient = [colors.surface, colors.surfaceMuted] as const;
  const isCompact = !illustrationUri && !authLayout;
  const isWeb = Platform.OS === 'web';
  const useNativeAuthHero = authLayout && !isWeb;
  const isWideDesktop = isWeb && width >= 1360;
  const isDesktop = isWeb && width >= 1100 && width < 1360;
  const isTabletWeb = isWeb && width >= 900 && width < 1100;
  const isWebNarrow = isWeb && width < 900;
  const isWebCompact = isWeb && width < 760;
  const webAuthWidth = isWebCompact ? '100%' : isWebNarrow ? 360 : isTabletWeb ? 380 : 420;
  const webHeadingSize = isWebCompact ? 26 : isTabletWeb ? 30 : 34;
  const webHeadingLineHeight = isWebCompact ? 32 : isTabletWeb ? 36 : 40;
  const reverseWebColumns = !isWebNarrow && webLayout === 'marketing-right';

  return (
    <AppSafeArea backgroundColor={colors.background}>
      <AppStatusBar />
      <AppKeyboardAvoiding style={[styles.flex, { backgroundColor: colors.background }]} surface="screen">
        <AppScrollView
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: isWeb ? spacing.xl : spacing.md,
              paddingBottom: spacing.xl,
              paddingHorizontal: isWebCompact ? spacing.md : isWideDesktop ? spacing.xxl : spacing.lg,
              gap: spacing.md,
            },
          ]}>
          {isWeb ? (
            <View
              style={[
                styles.webFrame,
                {
                  maxWidth: 1180,
                  alignSelf: 'center',
                  minHeight: isWideDesktop || isDesktop ? 640 : undefined,
                  gap: isWebNarrow ? spacing.lg : isTabletWeb ? spacing.lg : spacing.xl,
                  flexDirection: isWebNarrow ? 'column' : reverseWebColumns ? 'row-reverse' : 'row',
                  alignItems: isWebNarrow ? 'center' : 'center',
                  justifyContent: isWebNarrow ? 'flex-start' : 'center',
                },
              ]}>
              <View
                style={[
                  styles.webMarketing,
                  {
                    paddingVertical: isWebNarrow ? spacing.sm : spacing.lg,
                    maxWidth: isWebNarrow ? 560 : isTabletWeb ? 470 : 560,
                    width: isWebNarrow ? '100%' : undefined,
                    paddingRight: reverseWebColumns || isWebNarrow ? 0 : spacing.md,
                    paddingLeft: reverseWebColumns ? spacing.md : 0,
                  },
                ]}>
                <View style={styles.brandRow}>
                  <View style={[styles.webBrandIconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: surfaceRadius.button }]}>
                    <BrandingLogo logoDataUrl={logoDataUrl} size={24} color={brandingColor} variant="bot" />
                  </View>
                  <View>
                    <Text style={[typography.title, { color: colors.text }]}>{orgName}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{t('login.brand.tagline')}</Text>
                  </View>
                </View>

                <Text
                  style={[
                    typography.hero,
                    styles.webPitchTitle,
                    {
                      color: colors.text,
                      marginTop: isWebNarrow ? 12 : 20,
                      fontSize: isWebCompact ? 28 : isTabletWeb ? 32 : 36,
                      lineHeight: isWebCompact ? 35 : isTabletWeb ? 41 : 45,
                      maxWidth: isWebNarrow ? undefined : 480,
                    },
                  ]}>
                  {t('login.features.title')}
                </Text>
                <Text style={[typography.body, styles.webPitchSubtitle, { color: colors.textMuted }]}>
                  {t('login.features.description')}
                </Text>

                <View style={[styles.webFeatureList, { gap: spacing.md }]}>
                  <View style={styles.webFeatureItem}>
                    <View style={[styles.webFeatureIconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                      <AppIcon icon={ShieldCheck} size={14} />
                    </View>
                    <View>
                      <Text style={[typography.body, styles.webFeatureTitle, { color: colors.text }]}>{t('login.features.security.title')}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('login.features.security.description')}</Text>
                    </View>
                  </View>
                  <View style={styles.webFeatureItem}>
                    <View style={[styles.webFeatureIconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                      <AppIcon icon={Zap} size={14} />
                    </View>
                    <View>
                      <Text style={[typography.body, styles.webFeatureTitle, { color: colors.text }]}>{t('login.features.deployment.title')}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('login.features.deployment.description')}</Text>
                    </View>
                  </View>
                  <View style={styles.webFeatureItem}>
                    <View style={[styles.webFeatureIconWrap, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                      <AppIcon icon={ChartColumn} size={14} />
                    </View>
                    <View>
                      <Text style={[typography.body, styles.webFeatureTitle, { color: colors.text }]}>{t('login.features.analytics.title')}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('login.features.analytics.description')}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.webAuthColumn,
                  {
                    gap: spacing.md,
                    width: isWebNarrow ? '100%' : isTabletWeb ? 400 : 460,
                    maxWidth: isWebNarrow ? 420 : undefined,
                    alignItems: 'center',
                    justifyContent: isWebNarrow ? 'flex-start' : 'center',
                  },
                ]}>
                <View style={[styles.webAuthHeading, !isWebNarrow ? styles.webAuthHeadingDesktop : null]}>
                  <Text
                    style={[
                      typography.hero,
                      styles.webAuthTitle,
                      {
                        color: colors.text,
                        fontSize: webHeadingSize,
                        lineHeight: webHeadingLineHeight,
                        textAlign: isWebNarrow ? 'left' : 'center',
                      },
                    ]}>
                    {title}
                  </Text>
                  <Text style={[typography.body, { color: colors.textMuted, textAlign: isWebNarrow ? 'left' : 'center' }]}>
                    {subtitle}
                  </Text>
                </View>
                <View style={[styles.webFormWrap, { width: webAuthWidth }]}>
                  {children}
                </View>
                {showFooter ? (
                  <Text
                    style={[
                      typography.caption,
                      styles.footer,
                      { color: colors.textMuted, marginTop: spacing.sm, textAlign: isWebNarrow ? 'left' : 'center' },
                    ]}>
                    {t('login.footer.copyright')}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              {useNativeAuthHero ? (
                <LinearGradient
                  colors={heroGradient}
                  style={[
                    styles.hero,
                    elevation.card,
                    {
                      borderRadius: surfaceRadius.card,
                      borderColor: colors.border,
                      padding: spacing.lg,
                      gap: spacing.sm,
                    },
                  ]}>
                  <View style={[styles.brandRow, { justifyContent: 'center' }]}>
                    <BrandingLogo logoDataUrl={logoDataUrl} size={36} color={brandingColor} variant="bot" />
                    <View>
                      <Text style={[typography.title, { color: colors.text }]}>{orgName}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('login.brand.tagline')}</Text>
                    </View>
                  </View>
                  <View style={[styles.badge, { justifyContent: 'center' }]}>
                    <Sparkles size={15} color={brandingColor} />
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('common.premiumWorkspace')}
                    </Text>
                  </View>
                  <Text style={[typography.hero, styles.heroTitle, { color: colors.text, textAlign: 'center' }]}>
                    {title}
                  </Text>
                  <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center', lineHeight: 22 }]}>
                    {subtitle}
                  </Text>
                </LinearGradient>
              ) : isCompact ? (
                <View style={[styles.compactHeader, { paddingHorizontal: spacing.xs, gap: spacing.xs }]}>
                  <View style={[styles.brandRow,{justifyContent:'center'}]}>
                    <BrandingLogo logoDataUrl={logoDataUrl} size={32} color={brandingColor} variant="bot" />
                    <Text style={[typography.title, { color: colors.text }]}>{orgName}</Text>
                  </View>
                  <View style={[styles.badge,{justifyContent:'center'}]}>
                    <AppIcon icon={Sparkles} size={15} />
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{t('common.premiumWorkspace')}</Text>
                  </View>
                  <Text style={[typography.hero, styles.compactTitle, { color: colors.text, textAlign:'center' }]}>{title}</Text>
                  <Text style={[typography.body, { color: colors.textMuted ,textAlign:'center'}]}>{subtitle}</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={heroGradient}
                  style={[
                    styles.hero,
                    elevation.card,
                    {
                      borderRadius: surfaceRadius.card,
                      borderColor: colors.border,
                      padding: spacing.lg,
                      gap: spacing.xs,
                    },
                  ]}>
                  <View style={[styles.brandRow,{justifyContent:'center'}]}>
                    <BrandingLogo logoDataUrl={logoDataUrl} size={32} color={brandingColor} variant="bot" />
                    <Text style={[typography.title, { color: colors.text }]}>{orgName}</Text>
                  </View>
                  <View style={[styles.badge,{justifyContent:'center'}]}>
                    <AppIcon icon={Sparkles} size={15} />
                    <Text style={[typography.caption, { color: colors.textMuted }]}>{t('common.premiumWorkspace')}</Text>
                  </View>
                  <Text style={[typography.hero, styles.heroTitle, { color: colors.text }]}>{title}</Text>
                  <Text style={[typography.body, { color: colors.textMuted }]}>{subtitle}</Text>
                  {illustrationUri ? (
                    <View style={[styles.illustrationWrap, { marginTop: spacing.sm }]}>
                      <AppIllustration uri={illustrationUri} />
                    </View>
                  ) : null}
                </LinearGradient>
              )}
              {children}
              {showFooter ? (
                <Text style={[typography.caption, styles.footer, { color: colors.textMuted, marginTop: spacing.md }]}>
                  {t('login.footer.copyright')}
                </Text>
              ) : null}
            </>
          )}
        </AppScrollView>
      </AppKeyboardAvoiding>
    </AppSafeArea>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  hero: {
    borderWidth: 1,
  },
  webFrame: {
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  webMarketing: {
    flex: 1,
  },
  webBrandIconWrap: {
    width: 32,
    height: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  webPitchTitle: {
  },
  webPitchSubtitle: {
    marginTop: 10,
    lineHeight: 21,
    maxWidth: 540,
  },
  webFeatureList: {
    marginTop: 20,
  },
  webFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  webFeatureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: brandTokens.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFeatureTitle: {
    fontWeight: '500',
  },
  webAuthColumn: {
    alignSelf: 'stretch',
  },
  webAuthHeading: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 3,
  },
  webAuthHeadingDesktop: {
    alignItems: 'center',
  },
  webAuthTitle: {
    width: '100%',
  },
  webFormWrap: {
    maxWidth: 420,
  },
  compactHeader: {
    width: '100%',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    width: 32,
    height: 32,
  },
  heroTitle: {
    marginTop: 2,
  },
  compactTitle: {
    marginTop: 2,
    lineHeight: 40,
  },
  illustrationWrap: {
    overflow: 'hidden',
    borderRadius: brandTokens.radius.sm,
  },
  footer: {
    textAlign: 'center',
    width: '100%',
  },
});
