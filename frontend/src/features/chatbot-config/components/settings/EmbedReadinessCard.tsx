import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  checkChatbotEmbedReadiness,
  type EmbedProbeResult,
  type EmbedReadinessReport,
} from '@/features/chatbot-config/utils/check-embed-readiness';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

function statusIcon(
  status: EmbedProbeResult['status'],
  colors: ReturnType<typeof useAppTheme>['colors'],
) {
  if (status === 'ok') return <CheckCircle2 size={16} color={colors.success} />;
  if (status === 'missing') return <XCircle size={16} color={colors.danger} />;
  if (status === 'blocked') return <HelpCircle size={16} color={colors.warning} />;
  return <AlertTriangle size={16} color={colors.warning} />;
}

function statusLabel(status: EmbedProbeResult['status'], t: (key: string) => string): string {
  if (status === 'ok') return t('chatbot.integrations.embedCheck.status.ok');
  if (status === 'missing') return t('chatbot.integrations.embedCheck.status.missing');
  if (status === 'blocked') return t('chatbot.integrations.embedCheck.status.blocked');
  return t('chatbot.integrations.embedCheck.status.unreachable');
}

function ProbeRow({ probe }: { probe: EmbedProbeResult }) {
  const { colors, typography, spacing, fonts } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.probeHeader}>
        {statusIcon(probe.status, colors)}
        <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1 }]}>
          {probe.label} — {statusLabel(probe.status, t)}
        </Text>
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, fontFamily: fonts.mono, lineHeight: 18 }]}>
        {probe.url}
      </Text>
      {probe.detail ? (
        <Text style={[typography.caption, { color: colors.textSoft, lineHeight: 18 }]}>{probe.detail}</Text>
      ) : null}
    </View>
  );
}

export function EmbedReadinessCard() {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<EmbedReadinessReport | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const next = await checkChatbotEmbedReadiness();
      setReport(next);
    } finally {
      setLoading(false);
    }
  }, []);

  const overallColor =
    report?.overall === 'ready'
      ? colors.success
      : report?.overall === 'partial'
        ? colors.warning
        : report?.overall === 'failed'
          ? colors.danger
          : colors.textMuted;

  const overallText =
    report?.overall === 'ready'
      ? t('chatbot.integrations.embedCheck.overall.ready')
      : report?.overall === 'partial'
        ? t('chatbot.integrations.embedCheck.overall.partial')
        : report?.overall === 'failed'
          ? t('chatbot.integrations.embedCheck.overall.failed')
          : t('chatbot.integrations.embedCheck.overall.idle');

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
      ]}
      accessibilityLabel={t('chatbot.integrations.embedCheck.a11y')}>
      <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
        {t('chatbot.integrations.embedCheck.title')}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
        {t('chatbot.integrations.embedCheck.description')}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.integrations.embedCheck.runA11y')}
        disabled={loading}
        onPress={() => void runCheck()}
        style={({ pressed }) => [
          styles.button,
          {
            minHeight: CHATBOT_CONFIG_TOUCH_MIN,
            borderRadius: surfaceRadius.button,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            opacity: loading ? 0.7 : 1,
            paddingHorizontal: spacing.md,
            gap: spacing.xs,
          },
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <ActionIcons.refresh size={16} color={colors.textMuted} />
        )}
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
          {loading
            ? t('chatbot.integrations.embedCheck.running')
            : t('chatbot.integrations.embedCheck.run')}
        </Text>
      </Pressable>

      <Text style={[typography.body, { color: overallColor, fontWeight: '500' }]}>{overallText}</Text>

      {report ? (
        <View style={{ gap: spacing.md }}>
          <ProbeRow probe={report.init} />
          <ProbeRow probe={report.loader} />
          {report.overall === 'partial' ? (
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {t('chatbot.integrations.embedCheck.partialHint')}
            </Text>
          ) : null}
          {report.overall === 'failed' ? (
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {t('chatbot.integrations.embedCheck.failedHint')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  probeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
