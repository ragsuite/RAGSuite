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

/** Official CE ↔ EE comparison — source of truth for edition features. */
const ENTERPRISE_PRICING_URL = 'https://www.ragsuite.de/pricing/#comparison';

type Props = {
  /** Short product name (e.g. Advanced analytics). */
  featureName: string;
  /** Professional upsell body; module-specific. */
  message: string;
  /** Decorative fake UI only — never live data or EE source. */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * CE-only Enterprise locked preview.
 * Always-visible card over a blurred mock (no hover toggles — avoids click conflicts).
 * Security: decorative mock only. Real EE APIs remain entitlement-gated on the server.
 */
export function EnterpriseLockedPreview({ featureName, message, children, style }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  const openPricing = () => {
    void Linking.openURL(ENTERPRISE_PRICING_URL);
  };

  return (
    <View style={[styles.root, style]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.mockLayer,
          Platform.OS === 'web'
            ? ({ filter: 'blur(5px)', WebkitFilter: 'blur(5px)' } as ViewStyle)
            : { opacity: 0.42 },
        ]}>
        {children}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.overlay, { backgroundColor: 'rgba(27, 26, 23, 0.22)' }]}>
        <View
          accessibilityRole="summary"
          accessibilityLabel={t('enterprise.locked.a11y', {
            defaultValue: `Locked. ${featureName} requires RAGSuite Enterprise.`,
            feature: featureName,
          })}
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              padding: spacing.lg,
              gap: spacing.sm,
              maxWidth: 440,
            },
          ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Lock size={20} color={colors.primary} strokeWidth={2.25} />
            <EditionBadge variant="enterprise" />
          </View>

          <Text style={[typography.subtitle, { color: colors.text }]}>
            {t('enterprise.locked.title', {
              defaultValue: '{{feature}} is an Enterprise feature',
              feature: featureName,
            })}
          </Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>{message}</Text>
          <Text style={[typography.caption, { color: colors.textSoft }]}>
            {t('enterprise.locked.hint', {
              defaultValue:
                'See Community vs Enterprise on the RAGSuite pricing page, then talk to us to unlock this module.',
            })}
          </Text>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('enterprise.locked.cta', {
              defaultValue: 'Compare editions on ragsuite.de',
            })}
            onPress={openPricing}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: pressed ? colors.primaryPressed : colors.primary,
                borderRadius: surfaceRadius.button,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
              },
            ]}>
            <Text
              style={[
                typography.body,
                { color: colors.textOnPrimary, textAlign: 'center' },
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
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 420,
  },
  mockLayer: {
    ...StyleSheet.absoluteFillObject,
    padding: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    width: '100%',
  },
  cta: {
    marginTop: 4,
  },
});
