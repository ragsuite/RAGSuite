import React, { useEffect, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { ToastItem } from '@/shared/toast/toast-item';
import {
  getToastListSnapshot,
  subscribeToastList,
} from '@/shared/toast/toast-list-subscription';
import { useToastActionsContext } from '@/shared/toast/toast-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function ToastViewport() {
  const { dismiss, pause, resume, pauseAll, resumeAll } = useToastActionsContext();
  const toasts = useSyncExternalStore(subscribeToastList, getToastListSnapshot, getToastListSnapshot);
  const { spacing } = useAppTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.addEventListener('blur', pauseAll);
    window.addEventListener('focus', resumeAll);
    return () => {
      window.removeEventListener('blur', pauseAll);
      window.removeEventListener('focus', resumeAll);
    };
  }, [pauseAll, resumeAll]);

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.viewport,
        Platform.OS === 'web'
          ? {
              right: spacing.md,
              bottom: spacing.md,
              width: 420,
              maxWidth: 'calc(100vw - 32px)' as unknown as number,
              alignItems: 'flex-end',
            }
          : {
              left: spacing.sm,
              right: spacing.sm,
              top: Math.max(insets.top + spacing.sm, spacing.md),
            },
      ]}>
      <View pointerEvents="box-none" style={[styles.stack, { gap: spacing.xs }]}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
            onPause={() => pause(toast.id)}
            onResume={() => resume(toast.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    zIndex: overlayTokens.zIndex.content,
    pointerEvents: 'box-none',
  },
  stack: {
    width: '100%',
    pointerEvents: 'box-none',
  },
});
