import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { useTranslation } from '@/i18n';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { IntegrationCredentials } from '@/shared/utils/integration-credentials';
import { maskSecret } from '@/shared/utils/integration-credentials';
import { copyText } from '@/shared/utils/copy-text';

type Props = {
  variant: 'web' | 'mobile';
  credentials: IntegrationCredentials;
  onManageDomains: () => void;
  /** Mobile only: opens regenerate confirm / runs regenerate for the project mobile API key. */
  onRegenerateMobile?: () => void;
  regenerateDisabled?: boolean;
};

function CredentialRow({
  label,
  value,
  masked,
  copied,
  onCopy,
  trailing,
}: {
  label: string;
  value: string;
  masked?: boolean;
  copied?: boolean;
  onCopy: () => void;
  trailing?: React.ReactNode;
}) {
  const { colors, typography, spacing, fonts } = useAppTheme();
  const { t } = useTranslation();
  const display = masked ? maskSecret(value) : value;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          selectable
          style={[typography.caption, { color: colors.text, fontFamily: fonts.mono, lineHeight: 18, flexShrink: 1 }]}>
          {display}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            copied
              ? t('integrations.credentials.a11y.fieldCopied', { field: label })
              : t('integrations.credentials.a11y.copyField', { field: label })
          }
          onPress={onCopy}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              opacity: pressed ? 0.65 : 1,
            },
          ]}>
          {copied ? (
            <Check size={14} color={colors.success} />
          ) : (
            <ActionIcons.copy size={14} color={colors.textMuted} />
          )}
        </Pressable>
        {trailing}
      </View>
    </View>
  );
}

export function IntegrationCredentialsPanel({
  variant,
  credentials,
  onManageDomains,
  onRegenerateMobile,
  regenerateDisabled,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const mobileKey =
    credentials.mobileApiKey?.trim() ||
    credentials.mobileApiKeyMasked?.trim() ||
    credentials.mobileApiKeyPlaceholder;

  useEffect(() => {
    setRevealed(false);
  }, [credentials.mobileApiKey, credentials.mobileApiKeyMasked]);

  const copyValue = async (field: string, value: string) => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const projectId = credentials.projectId ?? t('integrations.credentials.projectIdPlaceholder');
  const canRevealMobile = Boolean(credentials.mobileApiKey?.trim());

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <Text style={[typography.headingSemibold, { color: colors.text }]}>
        {variant === 'web'
          ? t('integrations.credentials.web.title')
          : t('integrations.credentials.mobile.title')}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
        {variant === 'web'
          ? t('integrations.credentials.web.description')
          : t('integrations.credentials.mobile.description')}
      </Text>

      <CredentialRow
        label={t('integrations.credentials.projectId')}
        value={projectId}
        copied={copiedField === 'projectId'}
        onCopy={() => void copyValue('projectId', projectId)}
      />
      <CredentialRow
        label={t('integrations.credentials.apiEndpoint')}
        value={credentials.apiEndpoint}
        copied={copiedField === 'endpoint'}
        onCopy={() => void copyValue('endpoint', credentials.apiEndpoint)}
      />

      {variant === 'web' ? (
        <>
          <CredentialRow
            label={t('integrations.credentials.embedToken')}
            value={credentials.embedToken ?? t('integrations.credentials.embedTokenUnavailable')}
            masked={Boolean(credentials.embedToken)}
            copied={copiedField === 'embedToken'}
            onCopy={() => {
              if (credentials.embedToken) void copyValue('embedToken', credentials.embedToken);
            }}
          />
          <Pressable accessibilityRole="link" onPress={onManageDomains}>
            <Text style={[typography.buttonLabel, { color: colors.primary }]}>
              {t('integrations.credentials.manageDomains')}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <CredentialRow
            label={t('integrations.credentials.mobileApiKey')}
            value={mobileKey}
            masked={canRevealMobile ? !revealed : Boolean(credentials.mobileApiKeyMasked)}
            copied={copiedField === 'apiKey'}
            onCopy={() => void copyValue('apiKey', credentials.mobileApiKey?.trim() || mobileKey)}
            trailing={
              <>
                {canRevealMobile ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      revealed
                        ? t('integrations.credentials.mobile.hideKey')
                        : t('integrations.credentials.mobile.revealKey')
                    }
                    onPress={() => setRevealed((v) => !v)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.65 : 1 }]}>
                    {revealed ? (
                      <ActionIcons.hide size={14} color={colors.textMuted} />
                    ) : (
                      <ActionIcons.view size={14} color={colors.textMuted} />
                    )}
                  </Pressable>
                ) : null}
                {onRegenerateMobile ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('integrations.credentials.mobile.regenerateA11y')}
                    disabled={regenerateDisabled}
                    onPress={onRegenerateMobile}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconBtn,
                      { opacity: regenerateDisabled ? 0.45 : pressed ? 0.65 : 1 },
                    ]}>
                    <ActionIcons.refresh size={14} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </>
            }
          />
          <Text style={[typography.caption, { color: colors.warning, lineHeight: 18 }]}>
            {t('integrations.credentials.mobile.noEmbedToken')}
          </Text>
        </>
      )}

      {copiedField ? (
        <Text style={[typography.caption, { color: colors.success }]}>{t('integrations.credentials.copied')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
});
