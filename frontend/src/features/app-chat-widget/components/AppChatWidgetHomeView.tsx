import { AudioLines, Building2, ChevronRight, MessageCircle } from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { BrandingLogo } from '@/shared/components/branding-logo';
import { PRODUCT_WEBSITE_URL } from '@/shared/constants/product-links';
import { isLightWidgetColor } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { useWidgetLogoFit } from '@/features/app-chat-widget/hooks/use-widget-logo-fit';
import { resolveLayout2HomeHeaderMetrics } from '@/features/app-chat-widget/utils/layout2-home-header';
import { resolveWidgetLogoChrome } from '@/features/app-chat-widget/utils/widget-logo-chrome';

type Props = {
  displayName: string;
  statusText: string;
  ctaLabel: string;
  /** Solid brand primary for the Home header band. */
  headerBg: string;
  /** Contrast-safe text/icon color for the header band (Layout 1 parity). */
  headerTextColor?: string;
  /** Muted status line on the header band. */
  headerMutedColor?: string;
  /** Frosted chrome behind close / icon badge when no logo. */
  headerChromeBg?: string;
  accentColor: string;
  panelBg: string;
  textColor: string;
  mutedColor: string;
  /** Full panel content height (excluding tab bar). Header uses ~75%. */
  contentHeight: number;
  /**
   * EE white-label logo URL. When set (and showLogo), replaces the badge icon.
   * Same resolution as Layout 1 header logo.
   */
  logoUrl?: string | null;
  /** Mirrors Layout 1 `showLogo`: custom logo → brand mark → building fallback. */
  showLogo?: boolean;
  /** Circle crop vs aspect-flexible soft corners (EE customization). */
  logoShape?: 'circle' | 'flexible';
  /** Soft corner radius when logoShape is flexible (0–20). */
  logoBorderRadius?: number;
  /**
   * When true (default CE / EE without full white-label), logo + title open the product site.
   */
  linkBrandToProduct?: boolean;
  showClose?: boolean;
  onPressCta: () => void;
  /** When true, show a second Home card that opens Voice Pilot. */
  showVoicePilotCta?: boolean;
  voicePilotCtaLabel?: string;
  onPressVoicePilot?: () => void;
  onClose?: () => void;
  closeLabel?: string;
};

const CTA_SIDE_INSET = 16;
const BADGE_LEFT = 22;
const CTA_ROW_HEIGHT = 64;

export function AppChatWidgetHomeView({
  displayName,
  statusText,
  ctaLabel,
  headerBg,
  headerTextColor = '#FFFFFF',
  headerMutedColor = 'rgba(255,255,255,0.92)',
  headerChromeBg = 'rgba(255,255,255,0.2)',
  accentColor,
  panelBg,
  textColor,
  mutedColor,
  contentHeight,
  logoUrl = null,
  showLogo = true,
  logoShape = 'circle',
  logoBorderRadius = 8,
  linkBrandToProduct = false,
  showClose = false,
  onPressCta,
  showVoicePilotCta = false,
  voicePilotCtaLabel,
  onPressVoicePilot,
  onClose,
  closeLabel,
}: Props) {
  const { t } = useTranslation();
  const resolvedCta =
    ctaLabel.trim() || t('chatbot.widget.layout2.home.ctaDefault');
  const resolvedVoiceCta =
    (voicePilotCtaLabel || '').trim() ||
    t('chatbot.widget.layout2.home.voicePilotCta', { defaultValue: 'Voice Pilot' });
  const dualCta = Boolean(showVoicePilotCta && onPressVoicePilot);
  const resolvedLogoUrl = (logoUrl || '').trim();
  const [logoFailed, setLogoFailed] = useState(false);
  const showCustomLogo = Boolean(showLogo && resolvedLogoUrl && !logoFailed);
  const showLogoBadge = showCustomLogo || showLogo;
  const logoChrome = resolveWidgetLogoChrome(
    showCustomLogo ? resolvedLogoUrl : null,
    'home',
    { logoShape, logoBorderRadius },
  );
  const { fittedSize: homeLogoFit, onLogoLoad: onHomeLogoLoad } =
    useWidgetLogoFit(
      showCustomLogo ? resolvedLogoUrl : null,
      'home',
      logoChrome.isFlexible,
    );

  const openProductSite = () => {
    void Linking.openURL(PRODUCT_WEBSITE_URL);
  };

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUrl]);

  const { headerHeight, ctaOverlap, textBottom, badgeTop } = useMemo(
    () => resolveLayout2HomeHeaderMetrics(contentHeight, { dualCta }),
    [contentHeight, dualCta],
  );

  const ctaTop = headerHeight - ctaOverlap;
  const lightHeader = isLightWidgetColor(headerBg);
  const labelColor = textColor || '#222222';
  const chevronColor = mutedColor || '#9CA3AF';
  const pressBg = 'rgba(0,0,0,0.05)';

  const badgeContent = showCustomLogo ? (
    <Image
      key={`${resolvedLogoUrl}-${logoShape}`}
      source={{ uri: resolvedLogoUrl }}
      style={[logoChrome.image, logoChrome.isFlexible ? homeLogoFit ?? undefined : undefined]}
      contentFit={logoChrome.contentFit}
      accessibilityLabel={displayName}
      onLoad={onHomeLogoLoad}
      onError={() => setLogoFailed(true)}
    />
  ) : showLogo ? (
    <BrandingLogo
      logoDataUrl={null}
      size={22}
      color={accentColor}
      borderRadius={18}
      variant="bot"
      imageStyle={styles.brandLogoMark}
    />
  ) : (
    <Building2 size={16} color={headerTextColor} strokeWidth={2.25} />
  );

  const brandBadge = (
    <View
      style={[
        logoChrome.isCustom ? logoChrome.container : styles.brandBadge,
        logoChrome.isFlexible && homeLogoFit ? homeLogoFit : null,
        showLogoBadge
          ? styles.brandBadgeWithLogo
          : { backgroundColor: headerChromeBg },
      ]}
    >
      {badgeContent}
    </View>
  );

  const renderCtaRow = (opts: {
    label: string;
    onPress: () => void;
    icon: React.ReactNode;
    isFirst: boolean;
    isLast: boolean;
  }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={opts.label}
      onPress={opts.onPress}
      style={({ pressed, hovered }) => [
        styles.ctaRow,
        opts.isFirst ? styles.ctaRowFirst : null,
        opts.isLast ? styles.ctaRowLast : null,
        {
          backgroundColor: pressed || Boolean(hovered) ? pressBg : 'transparent',
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
      ]}
    >
      <View style={[styles.ctaIconWrap, { backgroundColor: `${accentColor}1F` }]}>
        {opts.icon}
      </View>
      <Text style={[styles.ctaLabel, { color: labelColor }]} numberOfLines={2}>
        {opts.label}
      </Text>
      <ChevronRight size={18} color={chevronColor} strokeWidth={2.25} />
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: panelBg }]}>
      <View
        style={[
          styles.headerBand,
          {
            backgroundColor: headerBg,
            height: headerHeight,
          },
        ]}
      >
        <View style={[styles.badgeRow, { top: badgeTop, left: BADGE_LEFT, right: BADGE_LEFT }]}>
          {linkBrandToProduct ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={displayName}
              onPress={openProductSite}
              style={({ pressed, hovered }) => [
                { opacity: pressed || hovered ? 0.82 : 1 },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
              ]}
            >
              {brandBadge}
            </Pressable>
          ) : (
            brandBadge
          )}
          {showClose && onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: headerChromeBg, opacity: pressed ? 0.7 : 0.92 },
              ]}
            >
              <Text style={[styles.closeGlyph, { color: headerTextColor }]}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.headerTextBlock, { bottom: textBottom }]}>
          {linkBrandToProduct ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={displayName}
              onPress={openProductSite}
              style={({ pressed, hovered }) => [
                { opacity: pressed || hovered ? 0.85 : 1 },
                Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
              ]}
            >
              <Text
                style={[styles.displayName, { color: headerTextColor }]}
                numberOfLines={2}
              >
                {displayName}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.displayName, { color: headerTextColor }]} numberOfLines={2}>
              {displayName}
            </Text>
          )}
          {statusText.trim() ? (
            <Text style={[styles.statusText, { color: headerMutedColor }]} numberOfLines={3}>
              {statusText.trim()}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.body, { backgroundColor: panelBg }]} />

      {/* One card stack so press/hover highlight stays inside each row. */}
      <View
        style={[
          styles.ctaStack,
          {
            top: ctaTop,
            left: CTA_SIDE_INSET,
            right: CTA_SIDE_INSET,
            backgroundColor: '#FFFFFF',
            ...(lightHeader
              ? { borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }
              : null),
          },
        ]}
      >
        {renderCtaRow({
          label: resolvedCta,
          onPress: onPressCta,
          icon: <MessageCircle size={20} color={accentColor} strokeWidth={2.25} />,
          isFirst: true,
          isLast: !dualCta,
        })}
        {dualCta ? (
          <>
            <View style={[styles.ctaDivider, { backgroundColor: 'rgba(0,0,0,0.08)' }]} />
            {renderCtaRow({
              label: resolvedVoiceCta,
              onPress: onPressVoicePilot!,
              icon: <AudioLines size={20} color={accentColor} strokeWidth={2.25} />,
              isFirst: false,
              isLast: true,
            })}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  headerBand: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  badgeRow: {
    position: 'absolute',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandBadgeWithLogo: {
    backgroundColor: '#FFFFFF',
  },
  brandLogoMark: {
    width: 22,
    height: 22,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '400',
    marginTop: -2,
  },
  headerTextBlock: {
    position: 'absolute',
    left: 22,
    right: 22,
    zIndex: 1,
    gap: 8,
  },
  displayName: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    letterSpacing: -0.35,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  body: {
    flex: 1,
  },
  ctaStack: {
    position: 'absolute',
    zIndex: 3,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: CTA_ROW_HEIGHT,
  },
  ctaRowFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  ctaRowLast: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  ctaDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  ctaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});
