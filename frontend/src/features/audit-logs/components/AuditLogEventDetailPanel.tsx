import { X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { AuditLogEventDetailContent } from '@/features/audit-logs/components/AuditLogEventDetailContent';
import { useAuditEventDetail } from '@/features/audit-logs/hooks/useAuditEventDetail';
import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';
import { useAuditLogsLayout } from '@/features/audit-logs/utils/audit-log-layout';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  eventId: string | null;
  previewEvent?: AuditEvent | null;
  onClose: () => void;
};

export function AuditLogEventDetailPanel({ eventId, previewEvent, onClose }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const toast = useStableToast();
  const { isDetailFullScreen } = useAuditLogsLayout();
  const [copiedDetails, setCopiedDetails] = useState(false);
  const { event, loading, error, reload } = useAuditEventDetail(eventId ?? undefined);
  const displayEvent = event ?? (previewEvent && previewEvent.id === eventId ? previewEvent : null);
  const panelPadding = isDetailFullScreen ? spacing.sm : spacing.md;

  const onCopyDetails = useCallback(async () => {
    if (!displayEvent?.details) return;
    try {
      await Clipboard.setStringAsync(JSON.stringify(displayEvent.details, null, 2));
      setCopiedDetails(true);
      toast({ description: t('audit.toast.copied'), variant: 'success' });
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch {
      toast({ description: t('audit.toast.copyFailed'), variant: 'error' });
    }
  }, [displayEvent?.details, t, toast]);

  if (!eventId) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: panelPadding,
            paddingVertical: spacing.sm,
            borderBottomColor: colors.border,
          },
        ]}>
        <Text
          style={[
            typography.subtitle,
            styles.headerTitle,
            { color: colors.text, fontSize: isDetailFullScreen ? 17 : 18 },
          ]}
          numberOfLines={1}>
          {t('audit.detail.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <AppScrollView
        style={styles.scroll}
        scrollbarVariant="overlay"
        contentContainerStyle={{
          paddingHorizontal: panelPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled">
        <StatePanel loading={loading && !displayEvent} error={error} onRetry={() => void reload()}>
          {displayEvent ? (
            <AuditLogEventDetailContent
              event={displayEvent}
              copiedDetails={copiedDetails}
              onCopyDetails={() => void onCopyDetails()}
            />
          ) : null}
        </StatePanel>
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
});
