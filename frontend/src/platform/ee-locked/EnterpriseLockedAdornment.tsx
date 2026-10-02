import { Lock } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, Text } from 'react-native';

import { useTranslation } from '@/i18n';
import { ENTERPRISE_PRICING_URL } from '@/platform/ee-locked/enterprise-pricing-url';
import { EditionBadge } from '@/shared/components/brand';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type AdornmentProps = {
  /** Include ENTERPRISE badge next to the lock (default true). */
  showBadge?: boolean;
  accessibilityLabel?: string;
};

/**
 * Clickable EE lock control for disabled fields / section titles.
 * Opens the pricing comparison page so users can understand the lock.
 */
export function EnterpriseLockedAdornment({
  showBadge = true,
  accessibilityLabel,
}: AdornmentProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        accessibilityLabel ??
        t('enterprise.locked.openPricing.a11y', {
          defaultValue: 'Open RAGSuite Enterprise pricing comparison',
        })
      }
      hitSlop={8}
      onPress={() => {
        void Linking.openURL(ENTERPRISE_PRICING_URL);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        // Never inherit parent “disabled” opacity — lock + badge must stay crisp.
        opacity: 1,
      }}>
      <Lock size={14} color={colors.primary} strokeWidth={2.25} />
      {showBadge ? <EditionBadge variant="enterprise" /> : null}
    </Pressable>
  );
}

type HintProps = {
  children: string;
};

/** Pressable EE caption under locked fields — same pricing destination as the lock. */
export function EnterpriseLockedHint({ children }: HintProps) {
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('enterprise.locked.openPricing.a11y', {
        defaultValue: 'Open RAGSuite Enterprise pricing comparison',
      })}
      hitSlop={4}
      onPress={() => {
        void Linking.openURL(ENTERPRISE_PRICING_URL);
      }}
      style={{ opacity: 1 }}>
      <Text style={[typography.caption, { color: colors.primary, opacity: 1 }]}>{children}</Text>
    </Pressable>
  );
}
