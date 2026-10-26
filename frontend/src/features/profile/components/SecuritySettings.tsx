import { Bell, KeyRound, Mail, Monitor, Shield } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import type { Security } from '@/features/profile/types/profile.types';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  security: Security;
  securityBusy?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  onToggleLoginAlerts: (value: boolean) => void;
  onEnableTotp: () => void;
  onDisableTotp: () => void;
  onRegenerateBackupCodes: () => void;
  onEmail2FAPress: () => void;
  onSessionsPress: () => void;
};

const ACTION_SIZE = 'compact' as const;

function Divider() {
  const { colors } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function SecurityRow({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  description: string;
  actions: React.ReactNode;
}) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.iconWrap,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
          },
        ]}>
        <Icon size={16} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[typography.body, styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>{description}</Text>
      </View>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

export function SecuritySettings({
  security,
  securityBusy = false,
  readOnly = false,
  embedded = false,
  onToggleLoginAlerts,
  onEnableTotp,
  onDisableTotp,
  onRegenerateBackupCodes,
  onEmail2FAPress,
  onSessionsPress,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();
  const controlsDisabled = securityBusy || readOnly;

  const rows = (
    <View style={{ gap: spacing.lg }}>
      {embedded ? null : (
        <>
          <Text style={[typography.headingSemibold, { color: colors.text }]}>
            {copy.sections.security.title}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 }]}>
            {copy.sections.security.description}
          </Text>
        </>
      )}
      <SecurityRow
        icon={Shield}
        title={copy.security.totpTitle}
        description={security.twoFactorEnabled ? copy.security.totpEnabled : copy.security.totpDisabled}
        actions={
          <View style={styles.actionGroup}>
            <Switch
              value={security.twoFactorEnabled}
              disabled={controlsDisabled}
              onValueChange={(next) => {
                if (next === security.twoFactorEnabled) return;
                if (next) onEnableTotp();
                else onDisableTotp();
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
            {security.twoFactorEnabled && security.hasBackupCodes ? (
              <AppSecondaryButton
                label={securityBusy ? copy.security.generating : copy.security.backupCodes}
                icon={KeyRound}
                onPress={onRegenerateBackupCodes}
                disabled={controlsDisabled}
                size={ACTION_SIZE}
                noTopMargin
              />
            ) : null}
          </View>
        }
      />

      <Divider />

      <SecurityRow
        icon={Mail}
        title={copy.security.email2faTitle}
        description={security.email2FAEnabled ? copy.security.email2faEnabled : copy.security.email2faDisabled}
        actions={
          <Switch
            value={security.email2FAEnabled}
            disabled={controlsDisabled}
            onValueChange={(next) => {
              if (next === security.email2FAEnabled) return;
              onEmail2FAPress();
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        }
      />

      <Divider />

      <SecurityRow
        icon={Bell}
        title={copy.security.loginNotificationsTitle}
        description={copy.security.loginNotificationsDescription}
        actions={
          <Switch
            value={security.loginAlerts}
            disabled={controlsDisabled}
            onValueChange={onToggleLoginAlerts}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        }
      />

      <Divider />

      <SecurityRow
        icon={Monitor}
        title={copy.security.sessionsTitle}
        description={copy.security.sessionsDescription}
        actions={
          <AppSecondaryButton
            label={copy.security.sessionsView}
            icon={Monitor}
            onPress={onSessionsPress}
            size={ACTION_SIZE}
            noTopMargin
          />
        }
      />
    </View>
  );

  if (embedded) {
    return rows;
  }

  return <FormCard>{rows}</FormCard>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 160,
    gap: 4,
  },
  title: {
  },
  actions: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  actionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  divider: {
    height: 1,
    width: '100%',
  },
});
