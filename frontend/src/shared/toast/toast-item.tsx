import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CircleCheckBig, CircleX, Info, TriangleAlert, X } from 'lucide-react-native';

import type { ToastRecord, ToastVariant } from '@/shared/toast/toast.types';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { motionDuration, useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { useTranslation } from '@/i18n';

type Props = {
  toast: ToastRecord;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
};

function variantIcon(variant: ToastVariant) {
  if (variant === 'success') return CircleCheckBig;
  if (variant === 'error') return CircleX;
  if (variant === 'warning') return TriangleAlert;
  return Info;
}

export function ToastItem({ toast, onDismiss, onPause, onResume }: Props) {
  const { colors, spacing, typography, elevation, surfaceRadius, radius } = useAppTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const entryValue = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const progressValue = useRef(new Animated.Value(1)).current;
  const entryAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const progressAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const tone = useMemo(() => {
    if (toast.variant === 'success') {
      return {
        iconColor: colors.success,
        borderColor: colors.success,
        backgroundColor: colors.surface,
        progressColor: colors.success,
      };
    }
    if (toast.variant === 'error') {
      return {
        iconColor: colors.danger,
        borderColor: colors.danger,
        backgroundColor: colors.dangerBackground,
        progressColor: colors.danger,
      };
    }
    if (toast.variant === 'warning') {
      return {
        iconColor: colors.warning,
        borderColor: colors.warning,
        backgroundColor: colors.ochreTint,
        progressColor: colors.warning,
      };
    }
    return {
      iconColor: colors.primary,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      progressColor: colors.primary,
    };
  }, [colors, toast.variant]);

  useEffect(() => {
    entryAnimationRef.current?.stop();
    entryValue.setValue(reducedMotion ? 1 : 0);
    const animation = Animated.timing(entryValue, {
      toValue: 1,
      duration: motionDuration(reducedMotion, 180),
      useNativeDriver: true,
    });
    entryAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished && entryAnimationRef.current === animation) {
        entryAnimationRef.current = null;
      }
    });

    return () => {
      animation.stop();
      if (entryAnimationRef.current === animation) {
        entryAnimationRef.current = null;
      }
    };
  }, [entryValue, reducedMotion, toast.id]);

  useEffect(() => {
    progressAnimationRef.current?.stop();
    progressValue.stopAnimation();
    const progressRatio = toast.durationMs > 0 ? Math.max(0, toast.remainingMs / toast.durationMs) : 0;
    progressValue.setValue(progressRatio);
    if (toast.paused || reducedMotion || toast.durationMs <= 0) {
      progressAnimationRef.current = null;
      return undefined;
    }
    const animation = Animated.timing(progressValue, {
      toValue: 0,
      duration: toast.remainingMs,
      useNativeDriver: false,
    });
    progressAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished && progressAnimationRef.current === animation) {
        progressAnimationRef.current = null;
      }
    });

    return () => {
      animation.stop();
      if (progressAnimationRef.current === animation) {
        progressAnimationRef.current = null;
      }
    };
  }, [progressValue, reducedMotion, toast.durationMs, toast.id, toast.paused, toast.remainingMs, toast.startedAt]);

  const Icon = variantIcon(toast.variant);
  const webHoverProps =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: onPause,
          onMouseLeave: onResume,
        } as Record<string, () => void>)
      : {};

  return (
    <Animated.View
      {...webHoverProps}
      accessibilityLiveRegion={toast.variant === 'error' ? 'assertive' : 'polite'}
      style={[
        styles.animated,
        {
          opacity: entryValue,
          transform: reducedMotion
            ? []
            : [
                {
                  translateY: entryValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
        },
      ]}>
      <View
        style={[
          styles.container,
          elevation.raised,
          {
            borderColor: tone.borderColor,
            backgroundColor: tone.backgroundColor,
            borderRadius: surfaceRadius.card,
            paddingHorizontal: spacing.sm,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xs,
          },
        ]}>
        <View style={[styles.contentRow, { gap: spacing.xs }]}>
          <Icon size={18} color={tone.iconColor} />
          <View style={styles.messageWrap}>
            {toast.title ? (
              <Text style={[typography.caption, styles.title, { color: colors.text }]}>
                {toast.title}
              </Text>
            ) : null}
            <Text style={[typography.caption, { color: toast.variant === 'error' ? colors.danger : colors.textSoft }]}>
              {toast.description}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.closeButton,
              {
                borderRadius: surfaceRadius.button,
                backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
              },
            ]}>
            <X size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border, borderRadius: radius.pill }]}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: tone.progressColor,
                borderRadius: radius.pill,
                width: progressValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animated: {
    width: '100%',
  },
  container: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  messageWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    marginBottom: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    marginRight: -10,
  },
  progressTrack: {
    height: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
});
