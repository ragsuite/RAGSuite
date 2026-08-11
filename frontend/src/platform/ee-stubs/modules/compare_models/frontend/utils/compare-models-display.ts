export function formatCompareLatencyMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2)} s`;
  return `${ms} ms`;
}

export function scoreTone(scorePercent: number): 'success' | 'warning' | 'danger' {
  if (scorePercent >= 70) return 'success';
  if (scorePercent >= 40) return 'warning';
  return 'danger';
}

export function normalizeCompareScore(raw: unknown): number {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
}
