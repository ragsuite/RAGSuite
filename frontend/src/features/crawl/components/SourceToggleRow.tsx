import React from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  description?: string;
  /** Longer explanation behind an (i) button next to the label. */
  info?: { title: string; body: string };
  value: boolean;
  onChange: (next: boolean) => void;
};

/** Labelled on/off switch for a source setting. */
export function SourceToggleRow({ label, description, info, value, onChange }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.row, { gap: spacing.sm, minHeight: TOUCH_TARGET_MIN }]}>
      <View style={[styles.copy, { gap: spacing.xxs }]}>
        <View style={[styles.labelRow, { gap: spacing.xxs }]}>
          <Text style={[typography.fieldLabel, styles.label, { color: colors.text }]}>{label}</Text>
          {info ? (
            <InfoHintButton
              title={info.title}
              body={info.body}
              accessibilityLabel={t('crawl.form.infoA11y', { label })}
              iconSize={16}
            />
          ) : null}
        </View>
        {description ? (
          <Text style={[typography.caption, styles.description, { color: colors.textMuted }]}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.control}>
        <Text style={[typography.caption, styles.state, { color: colors.textMuted }]}>
          {value ? t('common.on') : t('common.off')}
        </Text>
        <Switch
          accessibilityLabel={label}
          accessibilityRole="switch"
          accessibilityState={{ checked: value }}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={Platform.OS === 'android' ? (value ? colors.textOnPrimary : colors.surface) : colors.surface}
          ios_backgroundColor={colors.surfaceMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { flexShrink: 1 },
  description: { lineHeight: 18 },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 56,
    justifyContent: 'flex-end',
  },
  state: { fontWeight: '500', textAlign: 'right' },
});
