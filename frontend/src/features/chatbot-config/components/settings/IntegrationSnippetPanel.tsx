import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Globe, Smartphone } from 'lucide-react-native';

import { EditionBadge } from '@/shared/components/brand/edition-badge';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { copyText } from '@/shared/utils/copy-text';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { WebIntegrationInstructions } from '@/features/chatbot-config/components/settings/WebIntegrationInstructions';
import { buildChatbotWebCspAllowlist } from '@/features/chatbot-config/utils/chatbot-integration-snippets';
import { ActionIcons } from '@/shared/constants/action-icons';

type Variant = 'web' | 'mobile';

type Props = {
  variant: Variant;
};

export function IntegrationSnippetPanel({ variant }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { bundle, notify, saving, handleRegenerateScript } = useChatbotConfig();
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scripts = bundle?.integrationScripts;
  const Icon = variant === 'web' ? Globe : Smartphone;
  const snippet = scripts ? (variant === 'web' ? scripts.webSnippet : scripts.mobileSnippet) : '';
  const title = variant === 'web' ? t('chatbot.integrations.web.title') : t('chatbot.integrations.mobile.title');
  const subtitle =
    variant === 'web' ? t('chatbot.integrations.web.description') : t('chatbot.integrations.mobile.description');
  const mobileSteps = [
    t('chatbot.integrations.mobile.instructions.step1'),
    t('chatbot.integrations.mobile.instructions.step2'),
    t('chatbot.integrations.mobile.instructions.step3'),
    t('chatbot.integrations.mobile.instructions.step4'),
    t('chatbot.integrations.mobile.instructions.step5'),
  ];

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const copy = async () => {
    const ok = await copyText(snippet);
    if (!ok) {
      notify(t('chatbot.integrations.copyFailed'), 'error');
      return;
    }
    setCopied(true);
    notify(
      variant === 'web'
        ? t('chatbot.integrations.web.copy.description')
        : t('chatbot.integrations.mobile.copy.description'),
      'success',
    );
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <StatePanel isEmpty={!scripts} emptyLabel={t('chatbot.integrations.snippetUnavailable')}>
      {scripts ? (
        <View style={{ gap: spacing.md }}>
          <View style={[styles.sectionHeader, { gap: spacing.sm }]}>
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
              <Icon size={20} color={colors.primary} />
            </View>
            <View style={styles.sectionCopy}>
              <View style={[styles.titleRow, { gap: spacing.xs }]}>
                <Text style={[typography.headingSemibold, { color: colors.text }]}>{title}</Text>
                {variant === 'mobile' ? <EditionBadge variant="beta" /> : null}
              </View>
              <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>{subtitle}</Text>
            </View>
          </View>

          <IntegrationCodeBlock
            code={snippet}
            accessibilityLabel={`${title} script`}
            copied={copied}
            onCopy={() => void copy()}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('chatbot.integrations.web.regenerate.button')} ${title}`}
            disabled={saving}
            onPress={() => void handleRegenerateScript(variant)}
            style={({ pressed }) => [
              styles.regenerateBtn,
              {
                minHeight: CHATBOT_CONFIG_TOUCH_MIN,
                borderRadius: surfaceRadius.button,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                opacity: saving ? 0.58 : 1,
                paddingHorizontal: spacing.md,
                gap: spacing.xs,
              },
            ]}>
            <ActionIcons.refresh size={16} color={colors.textMuted} />
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
              {t('chatbot.integrations.web.regenerate.button')}
            </Text>
          </Pressable>

          {variant === 'web' ? (
            <WebIntegrationInstructions
              cspAllowlist={buildChatbotWebCspAllowlist()}
              onCspCopied={() => notify(t('integrations.web.csp.copied'), 'success')}
              onCspCopyFailed={() => notify(t('chatbot.integrations.copyFailed'), 'error')}
            />
          ) : (
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
                {t('chatbot.integrations.mobile.instructions.title')}
              </Text>
              {mobileSteps.map((step) => (
                <Text key={step} style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
                  • {step}
                </Text>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionCopy: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  callout: { borderWidth: 1 },
});
