import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative org members table — fake rows only. */
export function OrganizationMembersMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const rows = [
    { user: 'alex@example.com', role: 'Admin', status: 'Active' },
    { user: 'sam@example.com', role: 'Member', status: 'Active' },
    { user: 'jordan@example.com', role: 'Member', status: 'Invited' },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[typography.pageDisplay, { color: colors.text }]}>Team members</Text>
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: surfaceRadius.button,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}>
          <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '500' }]}>Invite</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
            padding: spacing.sm,
            backgroundColor: colors.surface,
          }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Search members</Text>
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: colors.surfaceMuted,
          }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Role</Text>
        </View>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        }}>
        <View
          style={{
            flexDirection: 'row',
            padding: spacing.sm,
            backgroundColor: colors.surfaceMuted,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
          {['User', 'Role', 'Status', 'Actions'].map((h) => (
            <Text key={h} style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((row) => (
          <View
            key={row.user}
            style={{
              flexDirection: 'row',
              padding: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
            <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{row.user}</Text>
            <Text style={[typography.body, { color: colors.textSoft, flex: 1 }]}>{row.role}</Text>
            <Text style={[typography.body, { color: colors.textSoft, flex: 1 }]}>{row.status}</Text>
            <Text style={[typography.caption, { color: colors.primary, flex: 1 }]}>Edit</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
