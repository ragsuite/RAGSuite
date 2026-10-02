import { Upload } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative Theme Option white-label fields — fake labels only, no uploads. */
export function WorkspaceWhiteLabelMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>
          {t('settings.branding.logoUpload')}
        </Text>
        <View
          style={[
            styles.logoSlot,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: colors.surfaceMuted,
            },
          ]}>
          <Upload size={22} color={colors.primary} strokeWidth={2} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('settings.branding.logoEmptyHint')}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>
          {t('settings.branding.orgName')}
        </Text>
        <View
          style={[
            styles.input,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surface,
            },
          ]}>
          <Text style={[typography.body, { color: colors.textMuted }]}>Your organization</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoSlot: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  input: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
  },
});
