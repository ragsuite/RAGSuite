import { Image } from 'expo-image';
import React from 'react';
import { CheckCircle2, FolderOpen } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  getOnboardingCopy,
} from '@/features/onboarding/onboarding.constants';
import type { OnboardingForm, OnboardingStep } from '@/features/onboarding/onboarding.types';
import { FormCard } from '@/shared/components/form-card';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  step: OnboardingStep;
  data: OnboardingForm;
  compact?: boolean;
};

function PreviewSubCard({
  title,
  children,
  compact = false,
}: {
  title?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const { colors, typography, surfaceRadius } = useAppTheme();
  return (
    <View
      style={[
        styles.subCard,
        compact ? styles.subCardCompact : null,
        { borderColor: colors.border, borderRadius: surfaceRadius.card },
      ]}>
      {title ? (
        <Text style={[typography.body, styles.subCardTitle, { color: colors.text }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function PreviewRow({
  label,
  value,
  mono = false,
  compact = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
}) {
  const { colors, typography, fonts } = useAppTheme();
  const monoStyle = { fontFamily: fonts.mono, fontSize: 13 };

  if (compact) {
    return (
      <View style={styles.previewRowCompact}>
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>{label}</Text>
        <Text
          style={[
            typography.body,
            { color: colors.text, lineHeight: 22 },
            mono ? monoStyle : null,
            compact ? styles.previewValueCompact : null,
          ]}
          numberOfLines={compact ? 6 : 4}>
          {value}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.previewRow}>
      <Text style={[typography.body, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          typography.body,
          styles.previewValue,
          { color: colors.text },
          mono ? monoStyle : null,
        ]}
        numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

export function LivePreviewPanel({ step, data, compact = false }: Props) {
  const { t } = useTranslation();
  const copy = getOnboardingCopy(t);
  const { colors, typography, surfaceRadius } = useAppTheme();
  const badgeBackground = colors.primaryTint;
  const badgeText = colors.primary;

  return (
    <FormCard>
      <Text style={[typography.subtitle, { color: colors.text, marginBottom: 12 }]}>{t('onboarding.preview.title')}</Text>

      {step === 1 ? (
        <PreviewSubCard compact={compact}>
          <View style={styles.brandingPreview}>
            <View style={styles.statusRow}>
              {data.branding.logoUri ? (
                <Image source={{ uri: data.branding.logoUri }} style={styles.logo} contentFit="cover" />
              ) : (
                <View style={[styles.logoPlaceholder, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]} />
              )}
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={2}>
                {data.branding.organizationName || t('onboarding.preview.branding.orgNamePlaceholder')}
              </Text>
            </View>
            <View style={[styles.previewButton, { backgroundColor: data.branding.primaryColor, borderRadius: surfaceRadius.button }]}>
              <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '500' }]}>
                {t('onboarding.preview.primaryButton')}
              </Text>
            </View>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 10, lineHeight: 18 }]}>
            {copy.branding.previewCaption}
          </Text>
        </PreviewSubCard>
      ) : null}

      {step === 2 ? (
        <PreviewSubCard compact={compact}>
          <View style={styles.statusRow}>
            <FolderOpen size={18} color={colors.primary} />
            <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]} numberOfLines={2}>
              {t('onboarding.preview.project.title')}
            </Text>
          </View>
          <View style={[styles.previewBlock, compact ? styles.previewBlockCompact : null]}>
            <PreviewRow
              label={t('onboarding.preview.project.nameLabel')}
              value={data.project.projectName || t('onboarding.preview.project.namePlaceholder')}
              compact={compact}
            />
            <PreviewRow
              label={t('onboarding.preview.project.descriptionLabel')}
              value={data.project.projectDescription || t('onboarding.preview.project.descriptionPlaceholder')}
              compact={compact}
            />
          </View>
          <View
            style={[
              styles.badge,
              compact ? styles.badgeCompact : null,
              { backgroundColor: badgeBackground, borderRadius: surfaceRadius.button },
            ]}>
            <Text style={[typography.caption, { color: badgeText, fontWeight: '500', lineHeight: 18 }]}>
              {copy.project.previewBadge}
            </Text>
          </View>
        </PreviewSubCard>
      ) : null}

      {step === 2 ? (
        <PreviewSubCard title={t('onboarding.preview.status.title')} compact={compact}>
          <View style={[styles.previewBlock, compact ? styles.previewBlockCompact : null]}>
            {copy.systemStatus.map((label) => (
              <View key={label} style={styles.statusRow}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={[typography.body, { color: colors.text, flex: 1, lineHeight: 22 }]}>{label}</Text>
              </View>
            ))}
          </View>
        </PreviewSubCard>
      ) : null}
    </FormCard>
  );
}

const styles = StyleSheet.create({
  subCard: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  subCardCompact: {
    padding: 12,
    gap: 8,
  },
  subCardTitle: {
    marginBottom: 2,
  },
  brandingPreview: {
    gap: 12,
  },
  previewBlock: {
    gap: 12,
  },
  previewBlockCompact: {
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewRowCompact: {
    gap: 4,
  },
  previewValueCompact: {
    lineHeight: 22,
  },
  previewValue: {
    flex: 1,
    textAlign: 'right',
  },
  previewButton: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    minWidth: 140,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  logoPlaceholder: {
    width: 24,
    height: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  badgeCompact: {
    alignSelf: 'stretch',
    marginTop: 2,
  },
  headlessPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headlessPillCompact: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
