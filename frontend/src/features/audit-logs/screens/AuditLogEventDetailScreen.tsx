import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuditLogEventDetailContent } from '@/features/audit-logs/components/AuditLogEventDetailContent';
import { useAuditEventDetail } from '@/features/audit-logs/hooks/useAuditEventDetail';
import { useTranslation } from '@/i18n';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  eventId: string;
};

export function AuditLogEventDetailScreen({ eventId }: Props) {
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useStableToast();
  const { event, loading, error, reload } = useAuditEventDetail(eventId);
  const [copiedDetails, setCopiedDetails] = useState(false);

  const onCopyDetails = useCallback(async () => {
    if (!event?.details) return;
    try {
      await Clipboard.setStringAsync(JSON.stringify(event.details, null, 2));
      setCopiedDetails(true);
      toast({ description: t('audit.toast.copied'), variant: 'success' });
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch {
      toast({ description: t('audit.toast.copyFailed'), variant: 'error' });
    }
  }, [event?.details, t, toast]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        horizontalPadding={spacing.sm}
        topPadding={spacing.sm}
        bottomPaddingExtra={insets.bottom + spacing.lg}
        stickyHeader={false}
        contentStyle={{ gap: spacing.md }}>
        <StatePanel loading={loading && !event} error={error} onRetry={() => void reload()}>
          {event ? (
            <AuditLogEventDetailContent
              event={event}
              copiedDetails={copiedDetails}
              onCopyDetails={() => void onCopyDetails()}
            />
          ) : null}
        </StatePanel>
      </FeatureScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
