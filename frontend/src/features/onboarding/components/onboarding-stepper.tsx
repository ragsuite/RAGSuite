import React, { useMemo } from 'react';
import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import type { OnboardingStep } from '@/features/onboarding/onboarding.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  step: OnboardingStep;
  compact?: boolean;
};

export function OnboardingStepper({ step, compact = false }: Props) {
  const { t } = useTranslation();
  const { colors, typography, surfaceRadius } = useAppTheme();
  const steps = useMemo(
    () =>
      [
        { title: t('onboarding.steps.branding.title'), subtitle: t('onboarding.steps.branding.description') },
        { title: t('onboarding.steps.project.title'), subtitle: t('onboarding.steps.project.description') },
      ] as const,
    [t],
  );
  const activeStep = steps[step - 1];

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
      {steps.map((stepInfo, index) => {
        const itemStep = (index + 1) as OnboardingStep;
        const active = itemStep === step;
        const done = itemStep < step;
        const upcoming = !active && !done;
        const connectorComplete = itemStep < step;

        return (
          <React.Fragment key={stepInfo.title}>
            <View style={[styles.item, compact ? styles.itemCompact : null]}>
              <View
                style={[
                  styles.dot,
                  {
                    borderRadius: surfaceRadius.button,
                    backgroundColor: active || done ? colors.primary : colors.border,
                  },
                ]}>
                {done ? (
                  <Check size={13} color={colors.textOnPrimary} strokeWidth={3} />
                ) : (
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: active ? colors.textOnPrimary : colors.textMuted,
                      },
                    ]}>
                    {itemStep}
                  </Text>
                )}
              </View>
              {!compact ? (
                <Text
                  style={[
                    typography.caption,
                    {
                      color: upcoming ? colors.textMuted : colors.text,
                      fontWeight: active ? '700' : '500',
                      textAlign: 'center',
                      flexShrink: 1,
                    },
                  ]}>
                  {stepInfo.title}
                </Text>
              ) : null}
              {!compact ? (
                <Text
                  style={[
                    styles.subLabel,
                    typography.caption,
                    { color: colors.textMuted, flexShrink: 1 },
                  ]}>
                  {stepInfo.subtitle}
                </Text>
              ) : null}
            </View>
            {index < steps.length - 1 ? (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor: connectorComplete ? colors.primary : colors.border,
                  },
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
      </View>

      {compact ? (
        <View style={styles.compactCaption}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500', textAlign: 'center' }]}>
            {t('onboarding.step.label', { step, title: activeStep.title })}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center', lineHeight: 20 }]}>
            {activeStep.subtitle}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    width: '100%',
    alignSelf: 'center',
  },
  item: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 2,
  },
  itemCompact: {
    flexShrink: 0,
  },
  dot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: 13,
    marginHorizontal: 2,
    minWidth: 8,
  },
  subLabel: {
    textAlign: 'center',
    lineHeight: 16,
  },
  compactCaption: {
    gap: 4,
    paddingHorizontal: 8,
    marginTop: 2,
  },
});
