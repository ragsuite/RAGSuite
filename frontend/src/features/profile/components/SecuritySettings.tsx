import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import type { Security } from '@/features/profile/types/profile.types';
import { AppButton } from '@/shared/components/app-button';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { FormCard } from '@/shared/components/form-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  security: Security;
  securityBusy?: boolean;
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
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: React.ReactNode;
}) {
  const { colors, spacing, typography } = useAppTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
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
  onToggleLoginAlerts,
  onEnableTotp,
  onDisableTotp,
  onRegenerateBackupCodes,
  onEmail2FAPress,
  onSessionsPress,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const copy = useProfileCopy();

  return (
    <FormCard>
      <Text style={[typography.headingSemibold, { color: colors.text }]}>
        {copy.sections.security.title}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 }]}>
        {copy.sections.security.description}
      </Text>

      <View style={{ gap: spacing.lg }}>
        <SecurityRow
          title={copy.security.totpTitle}
          description={security.twoFactorEnabled ? copy.security.totpEnabled : copy.security.totpDisabled}
          actions={
            security.twoFactorEnabled ? (
              <View style={styles.actionGroup}>
                <AppSecondaryButton
                  label={copy.security.disable}
                  onPress={onDisableTotp}
                  disabled={securityBusy}
                  size={ACTION_SIZE}
                  noTopMargin
                />
                {security.hasBackupCodes ? (
                  <AppSecondaryButton
                    label={securityBusy ? copy.security.generating : copy.security.backupCodes}
                    onPress={onRegenerateBackupCodes}
                    disabled={securityBusy}
                    size={ACTION_SIZE}
                    noTopMargin
                  />
                ) : null}
              </View>
            ) : (
              <AppSecondaryButton
                label={securityBusy ? copy.security.settingUp : copy.security.enable}
                onPress={onEnableTotp}
                disabled={securityBusy}
                size={ACTION_SIZE}
                noTopMargin
              />
            )
          }
        />

        <Divider />

        <SecurityRow
          title={copy.security.email2faTitle}
          description={security.email2FAEnabled ? copy.security.email2faEnabled : copy.security.email2faDisabled}
          actions={
            security.email2FAEnabled ? (
              <AppSecondaryButton
                label={securityBusy ? copy.security.processing : copy.security.disable}
                onPress={onEmail2FAPress}
                disabled={securityBusy}
                size={ACTION_SIZE}
                noTopMargin
              />
            ) : (
              <AppButton
                label={securityBusy ? copy.security.processing : copy.security.enable}
                onPress={onEmail2FAPress}
                disabled={securityBusy}
                size={ACTION_SIZE}
                noTopMargin
              />
            )
          }
        />

        <Divider />

        <SecurityRow
          title={copy.security.loginNotificationsTitle}
          description={copy.security.loginNotificationsDescription}
          actions={
            <Switch
              value={security.loginAlerts}
              disabled={securityBusy}
              onValueChange={onToggleLoginAlerts}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          }
        />

        <Divider />

        <SecurityRow
          title={copy.security.sessionsTitle}
          description={copy.security.sessionsDescription}
          actions={
            <AppSecondaryButton
              label={copy.security.sessionsView}
              onPress={onSessionsPress}
              size={ACTION_SIZE}
              noTopMargin
            />
          }
        />
      </View>
    </FormCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  copy: {
    flex: 1,
    minWidth: 200,
    gap: 4,
  },
  title: {
  },
  actions: {
    flexShrink: 0,
  },
  actionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  divider: {
    height: 1,
    width: '100%',
  },
});
