import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import {
  fetchProjectEmbeddingStatus,
  fetchProjectReindexProgress,
  startProjectEmbeddingReindex,
} from '@/features/search-config/services/search-config.service';
import type { EmbeddingStatus, ReindexProgress } from '@/features/search-config/types/embedding.types';
import { EmbeddingStatusConfigHints } from '@/features/search-config/components/settings/EmbeddingStatusConfigHints';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { semanticBannerTones } from '@/shared/utils/semantic-banner-tones';
import { ActionIcons } from '@/shared/constants/action-icons';

const POLL_INTERVAL_MS = 1200;

type Variant = 'empty' | 'ok' | 'needs-reindex' | 'error' | 'info';

function isTerminalStatus(status: ReindexProgress['status']) {
  return status === 'done' || status === 'completed_with_errors' || status === 'error';
}

function isActiveReindexStatus(status: ReindexProgress['status']) {
  return status === 'running' || status === 'started';
}

type Props = {
  refreshKey?: number | string;
  onStatusChange?: (status: EmbeddingStatus | null) => void;
  onReindexFinished?: (progress: ReindexProgress) => void;
};

export function SearchEmbeddingReindexBanner({ refreshKey, onStatusChange, onReindexFinished }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { activeProjectId } = useActiveProject();

  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReindexProgress | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const finishedRef = useRef<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!activeProjectId) {
      setStatus(null);
      onStatusChange?.(null);
      return;
    }
    setStatusLoading(true);
    setStatusError(null);
    try {
      const next = await fetchProjectEmbeddingStatus(activeProjectId, 'search');
      if (!next) {
        setStatus(null);
        setStatusError(t('search.embedding.status.loadFailed'));
        onStatusChange?.(null);
        return;
      }
      setStatus(next);
      onStatusChange?.(next);
    } catch (err) {
      const message = resolveAppErrorMessage(err, t, 'search.embedding.status.loadFailed');
      setStatusError(message);
      setStatus(null);
      onStatusChange?.(null);
    } finally {
      setStatusLoading(false);
    }
  }, [activeProjectId, onStatusChange, t]);

  const syncProgressOnLoad = useCallback(async () => {
    if (!activeProjectId) {
      setProgress(null);
      setReindexing(false);
      return;
    }
    try {
      const latest = await fetchProjectReindexProgress(activeProjectId, 'search');
      setProgress(latest);
      setReindexing(latest != null && isActiveReindexStatus(latest.status));
    } catch {
      setProgress(null);
      setReindexing(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    void (async () => {
      await loadStatus();
      await syncProgressOnLoad();
    })();
  }, [loadStatus, syncProgressOnLoad, refreshKey]);

  useEffect(() => {
    if (!reindexing || !activeProjectId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchProjectReindexProgress(activeProjectId, 'search');
        if (cancelled || !next) return;
        setProgress(next);
        if (isTerminalStatus(next.status)) {
          setReindexing(false);
          const key = `${next.status}-${next.embedded}-${next.total}`;
          if (finishedRef.current !== key) {
            finishedRef.current = key;
            onReindexFinished?.(next);
          }
          await loadStatus();
        }
      } catch {
        if (!cancelled) setReindexing(false);
      }
    };

    void tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reindexing, activeProjectId, loadStatus, onReindexFinished]);

  const handleReindex = useCallback(async () => {
    if (!activeProjectId) return;
    setReindexing(true);
    setProgress({
      project_id: activeProjectId,
      source: 'search',
      status: 'running',
      total: status?.coverage_items_total ?? 0,
      embedded: 0,
      skipped: 0,
      failed: 0,
      error: null,
      collection: status?.active_collection ?? '',
    });
    try {
      const final = await startProjectEmbeddingReindex(activeProjectId, 'search');
      setProgress(final);
      if (isTerminalStatus(final.status)) {
        setReindexing(false);
        onReindexFinished?.(final);
        await loadStatus();
      }
    } catch (err) {
      setReindexing(false);
      setStatusError(resolveAppErrorMessage(err, t, 'search.embedding.reindex.failed.title'));
    }
  }, [activeProjectId, status, loadStatus, onReindexFinished]);

  const variant = useMemo<Variant>(() => {
    if (!activeProjectId) return 'info';
    if (statusError) return 'error';
    if (!status) return 'info';
    if (status.coverage_items_total === 0) return 'empty';
    if (status.needs_reindex) return 'needs-reindex';
    return 'ok';
  }, [activeProjectId, status, statusError]);

  const palette = useMemo(() => {
    if (variant === 'needs-reindex') return semanticBannerTones('warning', colors);
    if (variant === 'error') return semanticBannerTones('error', colors);
    if (variant === 'ok') return semanticBannerTones('success', colors);
    return semanticBannerTones('neutral', colors);
  }, [variant, colors]);

  if (!activeProjectId) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: palette.border,
          backgroundColor: palette.bg,
          borderRadius: panelRadius,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={t('search.embedding.status.a11y')}>
      <View style={styles.row}>
        <View style={styles.icon}>
          {variant === 'needs-reindex' || variant === 'error' ? (
            <AlertTriangle size={18} color={palette.text} />
          ) : variant === 'ok' ? (
            <CheckCircle2 size={18} color={palette.text} />
          ) : (
            <Info size={18} color={palette.text} />
          )}
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          {variant === 'ok' && status ? (
            <>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                {t('search.embedding.status.allEmbedded.title')}
              </Text>
              <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
                {t('search.embedding.status.allEmbedded.body', {
                  count: status.active_vectors.toLocaleString(),
                  model: status.active_model,
                })}
              </Text>
              <EmbeddingStatusConfigHints
                status={status}
                namespace="search"
                textColor={palette.text}
              />
            </>
          ) : null}
          {variant === 'empty' && status ? (
            <>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                {t('search.embedding.status.emptyIndexed.title')}
              </Text>
              <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
                {t('search.embedding.status.emptyIndexed.body', { model: status.active_model })}
              </Text>
              <EmbeddingStatusConfigHints
                status={status}
                namespace="search"
                textColor={palette.text}
              />
            </>
          ) : null}
          {variant === 'needs-reindex' && status ? (
            <>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                {t('search.embedding.status.needsReindex.title')}
              </Text>
              <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
                {t('search.embedding.status.needsReindex.body', {
                  missing: status.coverage_items_missing,
                  total: status.coverage_items_total,
                  embedded: status.coverage_items_embedded,
                  model: status.active_model,
                })}
              </Text>
              <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
                {t('search.embedding.status.allEmbedded.body', {
                  count: status.active_vectors.toLocaleString(),
                  model: status.active_model,
                })}
              </Text>
              <EmbeddingStatusConfigHints
                status={status}
                namespace="search"
                textColor={palette.text}
              />
              {progress && (reindexing || isActiveReindexStatus(progress.status)) ? (
                <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
                  {t('search.embedding.reindex.progress', {
                    done: progress.embedded + progress.skipped + progress.failed,
                    total: progress.total,
                  })}
                </Text>
              ) : null}
            </>
          ) : null}
          {variant === 'error' ? (
            <>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                {t('search.embedding.status.error.title')}
              </Text>
              <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>{statusError}</Text>
            </>
          ) : null}
          {variant === 'info' && statusLoading ? (
            <Text style={[typography.caption, { color: palette.text, lineHeight: 18 }]}>
              {t('search.embedding.status.loadingStatus')}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          {variant === 'needs-reindex' ? (
            <AppButton
              label={
                reindexing
                  ? t('search.embedding.reindex.button.running')
                  : t('search.embedding.reindex.button.idle')
              }
              size="compact"
              disabled={reindexing}
              onPress={() => void handleReindex()}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('search.embedding.status.refreshA11y')}
              disabled={statusLoading}
              onPress={() => void loadStatus()}
              style={({ pressed }) => [
                styles.refreshBtn,
                {
                  borderRadius: controlRadius,
                  opacity: statusLoading ? 0.6 : pressed ? 0.8 : 1,
                },
              ]}>
              {statusLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <ActionIcons.refresh size={18} color={colors.primary} />
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { marginTop: 2 },
  actions: { alignSelf: 'flex-start' },
  refreshBtn: { padding: 6 },
});
