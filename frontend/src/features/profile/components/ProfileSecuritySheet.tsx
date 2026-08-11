import * as Clipboard from 'expo-clipboard';
import { AlertCircle, Check } from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import { ProfileDialogFooter } from '@/features/profile/components/ProfileDialogFooter';
import type { TwoFactorSetupResponse } from '@/features/profile/types/profile.api.types';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { PasswordField } from '@/shared/components/password-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

export type ProfileSecuritySheetMode = 'setup' | 'verify' | 'disable-totp' | 'email-password' | 'backup-codes' | null;

type Props = {
  mode: ProfileSecuritySheetMode;
  setupData: TwoFactorSetupResponse | null;
  backupCodes: string[];
  busy?: boolean;
  emailEnable?: boolean;
  onClose: () => void;
  onProceedToVerify: () => void;
  onVerifyCode: (code: string) => void;
  onDisableTotp: (password: string, code: string) => void;
  onEmailPassword: (password: string) => void;
};

const DialogFooter = ({
  onCancel,
  cancelLabel,
  primaryLabel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
}: {
  onCancel: () => void;
  cancelLabel: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
}) => {
  return (
    <ProfileDialogFooter
      cancelLabel={cancelLabel}
      primaryLabel={primaryLabel}
      onCancel={onCancel}
      onPrimary={onPrimary}
      primaryLoading={primaryLoading}
      primaryDisabled={primaryDisabled}
    />
  );
};

export function ProfileSecuritySheet({
  mode,
  setupData,
  backupCodes,
  busy = false,
  emailEnable = true,
  onClose,
  onProceedToVerify,
  onVerifyCode,
  onDisableTotp,
  onEmailPassword,
}: Props) {
  const { colors, spacing, surfaceRadius, typography, fonts } = useAppTheme();
  const profileCopy = useProfileCopy();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  React.useEffect(() => {
    if (!mode) return;
    setCode('');
    setPassword('');
    setDisableCode('');
    setCopiedCode(null);
  }, [mode]);

  if (!mode) return null;

  const copy = profileCopy.dialogs;

  if (mode === 'setup') {
    return (
      <AdaptiveOverlay
        visible
        title={copy.setup2fa.title}
        subtitle={copy.setup2fa.description}
        onClose={onClose}
        maxWidth={448}
        presentation="dialog"
        scrollable={false}
        footer={
          <DialogFooter
            onCancel={onClose}
            cancelLabel={copy.cancel}
            primaryLabel={copy.setup2fa.verify}
            onPrimary={onProceedToVerify}
            primaryDisabled={!setupData}
          />
        }>
        {setupData?.qr_code_url ? (
          <View style={[styles.qrWrap, { borderColor: colors.border, borderRadius: surfaceRadius.card, backgroundColor: colors.surface }]}>
            <Image source={{ uri: setupData.qr_code_url }} style={styles.qr} contentFit="contain" accessibilityLabel="Two-factor authentication QR code" />
          </View>
        ) : null}
      </AdaptiveOverlay>
    );
  }

  if (mode === 'verify') {
    return (
      <AdaptiveOverlay
        visible
        title={copy.verify2fa.title}
        subtitle={copy.verify2fa.description}
        onClose={onClose}
        maxWidth={448}
        presentation="dialog"
        footer={
          <DialogFooter
            onCancel={onClose}
            cancelLabel={copy.cancel}
            primaryLabel={busy ? copy.verify2fa.verifying : copy.verify2fa.verifyAndEnable}
            onPrimary={() => onVerifyCode(code)}
            primaryLoading={busy}
            primaryDisabled={code.length !== 6}
          />
        }>
        <AppTextField
          label={copy.verify2fa.codeLabel}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder={copy.verify2fa.codePlaceholder}
          maxLength={6}
          autoFocus={Platform.OS === 'web'}
          variant="otp"
        />
      </AdaptiveOverlay>
    );
  }

  if (mode === 'disable-totp') {
    return (
      <AdaptiveOverlay
        visible
        title={copy.disable2fa.title}
        subtitle={copy.disable2fa.description}
        onClose={onClose}
        maxWidth={448}
        presentation="dialog"
        footer={
          <DialogFooter
            onCancel={onClose}
            cancelLabel={copy.cancel}
            primaryLabel={busy ? copy.disable2fa.disabling : copy.disable2fa.disable}
            onPrimary={() => onDisableTotp(password, disableCode)}
            primaryLoading={busy}
            primaryDisabled={!password || disableCode.length !== 6}
          />
        }>
        <View style={{ gap: spacing.md }}>
          <PasswordField
            label={copy.disable2fa.passwordLabel}
            placeholder={copy.disable2fa.passwordPlaceholder}
            value={password}
            onChangeText={setPassword}
          />
          <AppTextField
            label={copy.disable2fa.codeLabel}
            value={disableCode}
            onChangeText={(value) => setDisableCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder={copy.disable2fa.codePlaceholder}
            maxLength={6}
            variant="otp"
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{copy.disable2fa.codeHelper}</Text>
        </View>
      </AdaptiveOverlay>
    );
  }

  if (mode === 'email-password') {
    const emailCopy = copy.email2fa;
    return (
      <AdaptiveOverlay
        visible
        title={emailEnable ? emailCopy.enableTitle : emailCopy.disableTitle}
        subtitle={emailEnable ? emailCopy.enableDescription : emailCopy.disableDescription}
        onClose={onClose}
        maxWidth={448}
        presentation="dialog"
        footer={
          <DialogFooter
            onCancel={onClose}
            cancelLabel={copy.cancel}
            primaryLabel={emailEnable ? profileCopy.security.enable : profileCopy.security.disable}
            onPrimary={() => onEmailPassword(password)}
            primaryLoading={busy}
            primaryDisabled={!password}
          />
        }>
        <PasswordField
          label={emailCopy.passwordLabel}
          placeholder={emailCopy.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
        />
      </AdaptiveOverlay>
    );
  }

  return (
    <AdaptiveOverlay
      visible
      title={copy.backupCodes.title}
      subtitle={copy.backupCodes.description}
      onClose={onClose}
      maxWidth={480}
      presentation="dialog"
      footer={<AppButton label={copy.backupCodes.saved} onPress={onClose} fullWidth size="compact" noTopMargin />}>
      <View style={[styles.noticeBox, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card, padding: spacing.sm, gap: spacing.xs }]}>
        <View style={styles.noticeRow}>
          <AlertCircle size={16} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>{copy.backupCodes.notice}</Text>
        </View>
      </View>
      <View style={[styles.codesGrid, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card, padding: spacing.sm }]}>
        {backupCodes.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`Copy backup code ${item}`}
            onPress={() => {
              void Clipboard.setStringAsync(item);
              setCopiedCode(item);
              setTimeout(() => setCopiedCode(null), 2000);
            }}
            style={styles.codeRow}>
            <Text style={[typography.body, styles.codeText, { color: colors.text, fontFamily: fonts.mono }]}>{item}</Text>
            {copiedCode === item ? (
              <Check size={14} color={colors.primary} />
            ) : (
              <ActionIcons.copy size={14} color={colors.textMuted} />
            )}
          </Pressable>
        ))}
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    alignSelf: 'center',
    borderWidth: 1,
    padding: 8,
  },
  qr: {
    width: 256,
    height: 256,
  },
  noticeBox: {},
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  codesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  codeRow: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 32,
  },
  codeText: {
    fontSize: 13,
  },
});
