export function countPromptWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatChatHistoryRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 45_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatChatHistoryListDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Full date + time under message bubbles in conversation detail (matches web history). */
export function formatChatHistoryMessageDate(iso: string): string {
  return formatChatHistoryListDate(iso);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(46, 106, 78, ${alpha})`;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getCitationCardColors(primary: string, mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      backgroundColor: hexToRgba(primary, 0.14),
      borderColor: hexToRgba(primary, 0.38),
    };
  }
  return {
    backgroundColor: hexToRgba(primary, 0.08),
    borderColor: hexToRgba(primary, 0.22),
  };
}
