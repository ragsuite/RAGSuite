import type { ChatQueryTagTone } from '@/features/chat-history/types/chat-history.types';
import { colors as themeColors } from '@/theme/colors';

export function formatQueryTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function formatLatencyMs(ms: number): string {
  return `${ms.toLocaleString()} ms`;
}

/** Timings panel: seconds with 2 decimals when >= 1s, otherwise ms. */
export function formatTimingSpanDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 1000) {
    const seconds = ms / 1000;
    const formatted = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
    return `${formatted}s`;
  }
  return `${Math.round(ms)} ms`;
}

export function formatSourceTypeLabel(sourceType: string | null | undefined): string {
  if (!sourceType?.trim()) return 'doc';
  return sourceType.trim().toLowerCase();
}

export function tagToneColors(
  tone: ChatQueryTagTone,
  mode: 'light' | 'dark',
): { background: string; text: string } {
  const palette = themeColors[mode];
  if (tone === 'greeting') {
    return { background: palette.primaryTint, text: palette.primary };
  }
  if (tone === 'high') {
    return { background: palette.primaryTint, text: palette.success };
  }
  if (tone === 'failed') {
    return { background: palette.dangerBackground, text: palette.danger };
  }
  if (tone === 'medium') {
    return { background: palette.ochreTint, text: palette.warning };
  }
  return { background: palette.surfaceMuted, text: palette.textSoft };
}
