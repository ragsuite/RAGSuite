import { AlertTriangle, Home, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { AppCard, AppCardContent } from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

type Variant = 'server' | 'network' | 'critical' | 'page' | 'component' | 'notFound' | 'permission';

type Props = {
  variant?: Variant;
  title?: string;
  description?: string;
  errorId?: string;
  errorMessage?: string | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryLoading?: boolean;
  showDevDetails?: boolean;
};

function iconTone(
  variant: Variant,
  colors: ReturnType<typeof useAppTheme>['colors'],
): { bg: string; fg: string } {
  if (variant === 'critical' || variant === 'network' || variant === 'component') {
    return { bg: colors.dangerBackground, fg: colors.danger };
  }
  if (variant === 'page') {
    return { bg: colors.ochreTint, fg: colors.warning };
  }
  if (variant === 'notFound') {
    return { bg: colors.surfaceMuted, fg: colors.textMuted };
  }
  return { bg: colors.dangerBackground, fg: colors.danger };
}

/**
 * Shared recovery card — parity with reference `ErrorPages` / `ErrorBoundary` fallbacks.
 */
export function ErrorStateCard({
  variant = 'server',
  title,
  description,
  errorId,
  errorMessage,
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
  primaryLoading,
  showDevDetails = __DEV__,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const tone = iconTone(variant, colors);

  const resolvedTitle =
    title ??
    (variant === 'critical'
      ? t('errors.critical.title')
      : variant === 'network'
        ? t('errors.network.unavailable.title')
        : variant === 'page'
          ? t('errors.page.title')
          : variant === 'component'
            ? t('errors.component.title')
            : variant === 'notFound'
              ? t('errors.notFound.title')
              : variant === 'permission'
                ? t('errors.permission.title')
                : t('errors.server.title'));

  const resolvedDescription =
    description ??
    (variant === 'critical'
      ? t('errors.critical.description')
      : variant === 'network'
        ? t('errors.network.unavailable.description')
        : variant === 'page'
          ? t('errors.page.description')
          : variant === 'component'
            ? t('errors.component.description')
            : variant === 'notFound'
              ? t('errors.notFound.description')
              : variant === 'permission'
                ? t('errors.permission.description')
                : t('errors.server.description'));

  const resolvedPrimary =
    primaryLabel ??
    (variant === 'critical'
      ? t('errors.critical.cta.reload')
      : variant === 'network'
        ? t('errors.network.unavailable.cta.retry')
        : variant === 'page' || variant === 'component'
          ? t('errors.page.cta.retry')
          : variant === 'notFound'
            ? t('errors.notFound.cta.home')
            : variant === 'permission'
              ? t('errors.permission.cta.home')
              : t('errors.server.cta.reload'));

  const resolvedSecondary =
    secondaryLabel ??
    (variant === 'page'
      ? t('errors.page.cta.home')
      : variant === 'network' || variant === 'server'
        ? t('errors.server.cta.home')
        : variant === 'notFound'
          ? t('errors.notFound.cta.back')
          : variant === 'permission'
            ? t('errors.permission.cta.retry')
            : undefined);

  if (variant === 'component') {
    return (
      <View
        style={[
          styles.componentBox,
          {
            borderColor: colors.border,
            backgroundColor: colors.dangerBackground,
            borderRadius: surfaceRadius.button,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}>
        <View style={[styles.componentRow, { gap: spacing.sm }]}>
          <AlertTriangle size={20} color={tone.fg} strokeWidth={2} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[typography.headingSemibold, { color: colors.text }]}>{resolvedTitle}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {resolvedDescription}
            </Text>
          </View>
        </View>
        {onPrimary ? (
          <AppButton label={resolvedPrimary} onPress={onPrimary} size="compact" variant="outline" icon={RefreshCw} />
        ) : null}
        {showDevDetails && errorMessage ? (
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('errors.dev.error')}: {errorMessage}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.root, { padding: spacing.lg, backgroundColor: colors.background }]}>
      <AppCard style={[styles.card, { maxWidth: 420, width: '100%' }]}>
        <AppCardContent>
          <View style={[styles.iconWrap, { backgroundColor: tone.bg, borderRadius: surfaceRadius.button }]}>
            <AlertTriangle size={24} color={tone.fg} strokeWidth={2} />
          </View>
          <Text style={[typography.pageDisplay, styles.title, { color: colors.text }]}>{resolvedTitle}</Text>
          <Text style={[typography.body, styles.description, { color: colors.textMuted }]}>
            {resolvedDescription}
          </Text>

          <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.md }]}>
            {onPrimary ? (
              <AppButton
                label={resolvedPrimary}
                onPress={onPrimary}
                variant="primary"
                fullWidth
                icon={RefreshCw}
                loading={primaryLoading}
                disabled={primaryLoading}
              />
            ) : null}
            {onSecondary && resolvedSecondary ? (
              <AppButton
                label={resolvedSecondary}
                onPress={onSecondary}
                variant="outline"
                fullWidth
                icon={Home}
                disabled={primaryLoading}
              />
            ) : null}
          </View>

          {showDevDetails && (errorId || errorMessage) ? (
            <View
              style={[
                styles.devBox,
                {
                  marginTop: spacing.md,
                  padding: spacing.sm,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: surfaceRadius.button,
                },
              ]}>
              {errorId ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {t('errors.dev.errorId')}: {errorId}
                </Text>
              ) : null}
              {errorMessage ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                  {t('errors.dev.error')}: {errorMessage}
                </Text>
              ) : null}
            </View>
          ) : null}
        </AppCardContent>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignSelf: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
  },
  devBox: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  componentBox: {
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  componentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
