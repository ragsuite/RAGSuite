import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { copyText } from '@/shared/utils/copy-text';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  cspAllowlist: string;
  onCopied?: () => void;
  onCopyFailed?: () => void;
};

export function WidgetInstallHostNotes({ cspAllowlist, onCopied, onCopyFailed }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const copyCsp = async () => {
    const ok = await copyText(cspAllowlist);
    if (!ok) {
      onCopyFailed?.();
      return;
    }
    setCopied(true);
    onCopied?.();
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={[
          styles.callout,
          {
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            borderRadius: surfaceRadius.card,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
          {t('integrations.web.csp.title')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
          {t('integrations.web.csp.intro')}
        </Text>
        {cspAllowlist ? (
          <IntegrationCodeBlock
            code={cspAllowlist}
            accessibilityLabel={t('integrations.web.csp.copyLabel')}
            copied={copied}
            onCopy={() => void copyCsp()}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.callout,
          {
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            borderRadius: surfaceRadius.card,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
          {t('integrations.web.proxy.title')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
          {t('integrations.web.proxy.body')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: { borderWidth: 1 },
});
