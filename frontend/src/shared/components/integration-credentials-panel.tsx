import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
};

function CredentialRow({
  label,
  value,
  masked,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  masked?: boolean;
  copied?: boolean;
  onCopy: () => void;
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
            styles.copyBtn,
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
      </View>
    </View>
  );
}

export function IntegrationCredentialsPanel({ variant, credentials, onManageDomains }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyValue = async (field: string, value: string) => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const projectId = credentials.projectId ?? t('integrations.credentials.projectIdPlaceholder');

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
            value={credentials.mobileApiKeyPlaceholder}
            copied={copiedField === 'apiKey'}
            onCopy={() => void copyValue('apiKey', credentials.mobileApiKeyPlaceholder)}
          />
          <Text style={[typography.caption, { color: colors.warning, lineHeight: 18 }]}>
            {t('integrations.credentials.mobile.noEmbedToken')}
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/configuration')}>
            <Text style={[typography.buttonLabel, { color: colors.primary }]}>
              {t('integrations.credentials.manageApiKeys')}
            </Text>
          </Pressable>
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
  copyBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
});
