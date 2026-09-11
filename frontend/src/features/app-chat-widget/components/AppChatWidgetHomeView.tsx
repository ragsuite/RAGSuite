import { Building2, ChevronRight, MessageCircle } from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { BrandingLogo } from '@/shared/components/branding-logo';

type Props = {
  displayName: string;
  statusText: string;
  ctaLabel: string;
  /** Solid brand primary for the Home header band. */
  headerBg: string;
  accentColor: string;
  panelBg: string;
  textColor: string;
  mutedColor: string;
  /** Full panel content height (excluding tab bar). Header uses 75%. */
  contentHeight: number;
  /**
   * EE white-label logo URL. When set (and showLogo), replaces the badge icon.
   * Same resolution as Layout 1 header logo.
   */
  logoUrl?: string | null;
  /** Mirrors Layout 1 `showLogo`: custom logo → brand mark → building fallback. */
  showLogo?: boolean;
  showClose?: boolean;
  onPressCta: () => void;
  onClose?: () => void;
  closeLabel?: string;
};

/**
 * Reference match: blue header ~75%, white body ~25%.
 * Badge near top with inset; name/status low near the CTA seam.
 */
const HEADER_RATIO = 0.75;
const CTA_OVERLAP = 32;
const CTA_SIDE_INSET = 16;
const MIN_HEADER = 280;
const MAX_HEADER = 520;
/** Inset from top of header to badge (extra space on top). */
const BADGE_TOP = 32;
const BADGE_LEFT = 22;
/** Keep name above the overlapping CTA. */
const TEXT_BOTTOM = 48;

export function AppChatWidgetHomeView({
  displayName,
  statusText,
  ctaLabel,
  headerBg,
  accentColor,
  panelBg,
  textColor,
  mutedColor,
  contentHeight,
  logoUrl = null,
  showLogo = true,
  showClose = false,
  onPressCta,
  onClose,
  closeLabel,
}: Props) {
  const { t } = useTranslation();
  const resolvedCta =
    ctaLabel.trim() || t('chatbot.widget.layout2.home.ctaDefault');
  const resolvedLogoUrl = (logoUrl || '').trim();
  const [logoFailed, setLogoFailed] = useState(false);
  const showCustomLogo = Boolean(showLogo && resolvedLogoUrl && !logoFailed);

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUrl]);

  const headerHeight = useMemo(() => {
    const raw = Math.round(Math.max(0, contentHeight) * HEADER_RATIO);
    if (raw <= 0) return MIN_HEADER;
    return Math.min(MAX_HEADER, Math.max(MIN_HEADER, raw));
  }, [contentHeight]);

  const ctaTop = headerHeight - CTA_OVERLAP;

  const badgeContent = showCustomLogo ? (
    <Image
      source={{ uri: resolvedLogoUrl }}
      style={styles.brandLogo}
      contentFit="cover"
      accessibilityLabel={displayName}
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
    <Building2 size={16} color="#FFFFFF" strokeWidth={2.25} />
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
        <View style={[styles.badgeRow, { top: BADGE_TOP, left: BADGE_LEFT, right: BADGE_LEFT }]}>
          <View
            style={[
              styles.brandBadge,
              showCustomLogo || showLogo ? styles.brandBadgeWithLogo : null,
            ]}
          >
            {badgeContent}
          </View>
          {showClose && onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.7 : 0.92 },
              ]}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.headerTextBlock, { bottom: TEXT_BOTTOM }]}>
          <Text style={styles.displayName} numberOfLines={2}>
            {displayName}
          </Text>
          {statusText.trim() ? (
            <Text style={styles.statusText} numberOfLines={3}>
              {statusText.trim()}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.body, { backgroundColor: panelBg }]} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resolvedCta}
        onPress={onPressCta}
        style={({ pressed }) => [
          styles.ctaCard,
          {
            top: ctaTop,
            left: CTA_SIDE_INSET,
            right: CTA_SIDE_INSET,
            backgroundColor: '#FFFFFF',
            opacity: pressed ? 0.94 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.ctaIconWrap,
            { backgroundColor: `${accentColor}1F` },
          ]}
        >
          <MessageCircle size={20} color={accentColor} strokeWidth={2.25} />
        </View>
        <Text
          style={[styles.ctaLabel, { color: textColor || '#222222' }]}
          numberOfLines={2}
        >
          {resolvedCta}
        </Text>
        <ChevronRight
          size={18}
          color={mutedColor || '#9CA3AF'}
          strokeWidth={2.25}
        />
      </Pressable>
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
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandBadgeWithLogo: {
    backgroundColor: '#FFFFFF',
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  closeGlyph: {
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.35,
  },
  statusText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  body: {
    flex: 1,
  },
  ctaCard: {
    position: 'absolute',
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 15,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
