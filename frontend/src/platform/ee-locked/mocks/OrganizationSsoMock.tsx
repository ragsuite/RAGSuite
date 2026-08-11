import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative SSO settings panel — fake fields only. */
export function OrganizationSsoMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const fields = ['Provider', 'Client ID', 'Client secret', 'Email domains', 'Callback URL'];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.pageDisplay, { color: colors.text }]}>Single sign-on</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Configure SAML / OIDC for your organisation.
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          backgroundColor: colors.surface,
          gap: spacing.md,
        }}>
        {fields.map((label) => (
          <View key={label} style={{ gap: spacing.xxs }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.borderStrong,
                borderRadius: surfaceRadius.button,
                padding: spacing.sm,
                backgroundColor: colors.surfaceMuted,
                minHeight: 40,
              }}
            />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}>
            <Text style={[typography.body, { color: colors.text }]}>Test connection</Text>
          </View>
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: surfaceRadius.button,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}>
            <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '500' }]}>Save</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
