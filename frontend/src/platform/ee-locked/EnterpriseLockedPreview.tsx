import { Lock } from 'lucide-react-native';
import React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { EditionBadge } from '@/shared/components/brand';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ENTERPRISE_PRICING_URL } from '@/platform/ee-locked/enterprise-pricing-url';

type Props = {
  /** Short product name (e.g. Dashboard). */
  featureName: string;
  /** Professional upsell body; module-specific. */
  message: string;
  /** Decorative fake UI only — never live data or EE source. */
  children: React.ReactNode;
  /** Full-page module teaser vs inline panel section (e.g. settings white-label). */
  variant?: 'page' | 'section';
  /** Show pricing follow-up line (default: page teasers only). */
  includeHint?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the blurred mock layer (e.g. zero padding to align with a host table). */
  mockStyle?: StyleProp<ViewStyle>;
  /** Grow with the upsell card instead of a fixed height, so narrow hosts never clip it. */
  fitContent?: boolean;
};

/**
 * CE-only Enterprise locked preview.
 * Always-visible card over a blurred mock (no hover toggles — avoids click conflicts).
 * Security: decorative mock only. Real EE APIs remain entitlement-gated on the server.
 */
export function EnterpriseLockedPreview({
  featureName,
  message,
  children,
  variant = 'page',
  includeHint,
  style,
  mockStyle,
  fitContent = false,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const isSection = variant === 'section';
  const showHint = includeHint ?? !isSection;

  const openPricing = () => {
    void Linking.openURL(ENTERPRISE_PRICING_URL);
  };

  return (
    <View
      style={[
        styles.root,
        isSection ? styles.rootSection : styles.rootPage,
        fitContent && styles.rootFitContent,
        style,
      ]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.mockLayer,
          isSection ? styles.mockLayerSection : null,
          Platform.OS === 'web'
            ? ({ filter: 'blur(5px)', WebkitFilter: 'blur(5px)' } as ViewStyle)
            : { opacity: 0.42 },
          mockStyle,
        ]}>
        <View style={isSection ? styles.mockContentSection : styles.mockContentPage}>{children}</View>
      </View>

      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          isSection ? styles.overlaySection : null,
          fitContent && styles.overlayFitContent,
          { backgroundColor: isSection ? 'rgba(27, 26, 23, 0.18)' : 'rgba(27, 26, 23, 0.22)' },
        ]}>
        <View
          accessibilityRole="summary"
          accessibilityLabel={t('enterprise.locked.a11y', {
            defaultValue: `Locked. ${featureName} requires RAGSuite Enterprise.`,
            feature: featureName,
          })}
          style={[
            styles.card,
            isSection ? styles.cardSection : null,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              padding: isSection ? spacing.md : spacing.lg,
              gap: isSection ? spacing.xs : spacing.sm,
              maxWidth: isSection ? 360 : 440,
            },
          ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Lock size={isSection ? 18 : 20} color={colors.primary} strokeWidth={2.25} />
            <EditionBadge variant="enterprise" />
          </View>

          <Text
            style={[
              isSection ? typography.body : typography.subtitle,
              {
                color: colors.text,
                fontWeight: '600',
                lineHeight: isSection ? 22 : undefined,
              },
            ]}>
            {t('enterprise.locked.title', {
              defaultValue: '{{feature}} is an Enterprise feature',
              feature: featureName,
            })}
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.textMuted,
                lineHeight: 22,
              },
            ]}>
            {message}
          </Text>
          {showHint ? (
            <Text style={[typography.caption, { color: colors.textSoft, lineHeight: 18 }]}>
              {t('enterprise.locked.hint', {
                defaultValue:
                  'See Community vs Enterprise on the RAGSuite pricing page, then talk to us to unlock this module.',
              })}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('enterprise.locked.cta', {
              defaultValue: 'Compare editions on ragsuite.de',
            })}
            onPress={openPricing}
            style={({ pressed }) => [
              styles.cta,
              isSection ? styles.ctaSection : null,
              {
                backgroundColor: pressed ? colors.primaryPressed : colors.primary,
                borderRadius: surfaceRadius.button,
                paddingVertical: isSection ? spacing.xs + 2 : spacing.sm,
                paddingHorizontal: spacing.md,
              },
            ]}>
            <Text
              style={[
                isSection ? typography.caption : typography.body,
                {
                  color: colors.textOnPrimary,
                  textAlign: 'center',
                  fontWeight: '600',
                },
              ]}>
              {t('enterprise.locked.cta', { defaultValue: 'Compare editions · ragsuite.de/pricing' })}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'stretch',
    width: '100%',
  },
  rootPage: {
    flex: 1,
    flexGrow: 1,
    minHeight: 0,
  },
  rootSection: {
    minHeight: 280,
    borderRadius: 12,
    width: '100%',
  },
  mockContentPage: {
    flexGrow: 1,
    minHeight: '100%',
  },
  mockContentSection: {
    minHeight: 240,
  },
  mockLayer: {
    ...StyleSheet.absoluteFillObject,
    padding: 24,
  },
  mockLayerSection: {
    padding: 20,
    justifyContent: 'flex-start',
  },
  rootFitContent: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlaySection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  overlayFitContent: {
    position: 'relative',
    flexGrow: 1,
  },
  card: {
    borderWidth: 1,
    width: '100%',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(27, 26, 23, 0.12)' } as ViewStyle,
      default: {},
    }),
  },
  cardSection: {
    flexShrink: 0,
  },
  cta: {
    marginTop: 4,
  },
  ctaSection: {
    marginTop: 8,
  },
});
